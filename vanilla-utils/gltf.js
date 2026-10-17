// Carregador mínimo de arquivos .glb (glTF binário) para WebGL2.
// Suporta: malhas triangulares, hierarquia de nós, material com cor/textura
// base (PBR metallic-roughness, usamos apenas a "albedo") e compressão
// KHR_draco_mesh_compression (usada pelo modelo de exemplo).
import { m4 } from '../twgl.full.module.js'

// localizações fixas dos atributos: os shaders devem declarar
// layout(location = N) com esses mesmos números
export const ATTRIBUTE_LOCATIONS = { a_coords: 0, a_normal: 1, a_texcoord: 2 }

const COMPONENT_ARRAYS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array
}
const COMPONENTS_PER_TYPE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

const DRACO_PATH = './vendor/draco/'
let dracoPromise = null

function loadDraco() {
  dracoPromise ??= (async () => {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = DRACO_PATH + 'draco_wasm_wrapper.js'
      script.onload = resolve
      script.onerror = () => reject(new Error('Falha ao carregar o decodificador Draco'))
      document.head.appendChild(script)
    })
    const wasmBinary = await fetch(DRACO_PATH + 'draco_decoder.wasm').then(r => r.arrayBuffer())
    // o módulo do emscripten possui um método "then", então o embrulhamos
    // para que o await não tente tratá-lo como uma promise
    return new Promise(resolve => {
      // eslint-disable-next-line no-undef
      DracoDecoderModule({ wasmBinary }).then(module => resolve({ module }))
    })
  })()
  return dracoPromise
}

async function decodeDracoPrimitive(primitive, bufferView, bin) {
  const { module: draco } = await loadDraco()
  const ext = primitive.extensions.KHR_draco_mesh_compression
  const bytes = new Int8Array(bin.buffer, bin.byteOffset + (bufferView.byteOffset ?? 0), bufferView.byteLength)

  const decoder = new draco.Decoder()
  const buffer = new draco.DecoderBuffer()
  buffer.Init(bytes, bytes.length)
  const mesh = new draco.Mesh()
  const status = decoder.DecodeBufferToMesh(buffer, mesh)
  if (!status.ok() || mesh.ptr === 0) {
    throw new Error('Falha ao decodificar malha Draco: ' + status.error_msg())
  }

  const numPoints = mesh.num_points()
  const readAttribute = (name) => {
    if (ext.attributes[name] === undefined) return null
    const attribute = decoder.GetAttributeByUniqueId(mesh, ext.attributes[name])
    const numComponents = attribute.num_components()
    const array = new draco.DracoFloat32Array()
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, array)
    const result = new Float32Array(numPoints * numComponents)
    for (let i = 0; i < result.length; i++) result[i] = array.GetValue(i)
    draco.destroy(array)
    return result
  }

  const positions = readAttribute('POSITION')
  const normals = readAttribute('NORMAL')
  const uvs = readAttribute('TEXCOORD_0')
  const joints = readAttribute('JOINTS_0')
  const weights = readAttribute('WEIGHTS_0')

  const numIndices = mesh.num_faces() * 3
  const ptr = draco._malloc(numIndices * 4)
  decoder.GetTrianglesUInt32Array(mesh, numIndices * 4, ptr)
  const indices = new Uint32Array(draco.HEAPU32.buffer, ptr, numIndices).slice()
  draco._free(ptr)

  draco.destroy(mesh)
  draco.destroy(buffer)
  draco.destroy(decoder)
  return { positions, normals, uvs, indices, joints, weights }
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index]
  const view = gltf.bufferViews[accessor.bufferView]
  const ArrayType = COMPONENT_ARRAYS[accessor.componentType]
  const components = COMPONENTS_PER_TYPE[accessor.type]
  const offset = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const stride = view.byteStride ?? components * ArrayType.BYTES_PER_ELEMENT
  const result = new ArrayType(accessor.count * components)
  const dataView = new DataView(bin.buffer, offset)
  const getters = {
    5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16',
    5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32'
  }
  const getter = getters[accessor.componentType]
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      result[i * components + c] = dataView[getter](i * stride + c * ArrayType.BYTES_PER_ELEMENT, true)
    }
  }
  return result
}

function decodePrimitive(gltf, bin, primitive) {
  if (primitive.extensions?.KHR_draco_mesh_compression) {
    const bufferView = gltf.bufferViews[primitive.extensions.KHR_draco_mesh_compression.bufferView]
    return decodeDracoPrimitive(primitive, bufferView, bin)
  }
  const { POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0 } = primitive.attributes
  const positions = readAccessor(gltf, bin, POSITION)
  const indices = primitive.indices !== undefined
    ? readAccessor(gltf, bin, primitive.indices)
    : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  return {
    positions,
    normals: NORMAL !== undefined ? readAccessor(gltf, bin, NORMAL) : null,
    uvs: TEXCOORD_0 !== undefined ? readAccessor(gltf, bin, TEXCOORD_0) : null,
    indices,
    joints: JOINTS_0 !== undefined ? readAccessor(gltf, bin, JOINTS_0) : null,
    weights: WEIGHTS_0 !== undefined ? readAccessor(gltf, bin, WEIGHTS_0) : null
  }
}

// normais suaves (média das normais das faces) para modelos que não as trazem
function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
    const e1 = [0, 1, 2].map(k => positions[b + k] - positions[a + k])
    const e2 = [0, 1, 2].map(k => positions[c + k] - positions[a + k])
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normals[v + k] += n[k]
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    for (let k = 0; k < 3; k++) normals[i + k] /= len
  }
  return normals
}

// Aplica o skinning uma única vez, na pose do arquivo (sem animação).
// Pela especificação, a transformação do nó da malha é ignorada quando há skin:
// a posição final é sum(peso * jointWorld * inverseBind * posição).
function applySkin(positions, normals, joints, weights, jointMatrices) {
  const outPositions = new Float32Array(positions.length)
  const outNormals = new Float32Array(normals.length)
  for (let i = 0; i < positions.length / 3; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]
    const sp = [0, 0, 0]
    const sn = [0, 0, 0]
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k]
      if (w === 0) continue
      const m = jointMatrices[Math.round(joints[i * 4 + k])]
      const tp = m4.transformPoint(m, p)
      const tn = m4.transformDirection(m, n)
      for (let c = 0; c < 3; c++) {
        sp[c] += w * tp[c]
        sn[c] += w * tn[c]
      }
    }
    const len = Math.hypot(...sn) || 1
    for (let c = 0; c < 3; c++) {
      outPositions[i * 3 + c] = sp[c]
      outNormals[i * 3 + c] = sn[c] / len
    }
  }
  return { positions: outPositions, normals: outNormals }
}

// pares de vértices (arestas) sem repetição, para desenhar com gl.LINES
function uniqueEdges(indices, vertexCount) {
  const seen = new Set()
  const edges = []
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]
      const b = indices[i + (k + 1) % 3]
      const key = Math.min(a, b) * vertexCount + Math.max(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      edges.push(a, b)
    }
  }
  return new Uint32Array(edges)
}

function nodeMatrix(node) {
  if (node.matrix) return new Float32Array(node.matrix)
  const t = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const s = node.scale ?? [1, 1, 1]
  // quaternion -> matriz de rotação, então T * R * S (colunas)
  const m = m4.identity()
  m.set([
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1
  ])
  return m
}

function createTexture(gl, gltf, images, textureIndex) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  if (textureIndex === undefined) {
    // sem textura: 1 pixel branco, assim o shader sempre pode amostrar
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    return texture
  }
  const textureDef = gltf.textures[textureIndex]
  const sampler = gltf.samplers?.[textureDef.sampler] ?? {}
  const source = textureDef.source ?? Object.values(textureDef.extensions ?? {})[0]?.source
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[source])
  const minFilter = sampler.minFilter ?? gl.LINEAR_MIPMAP_LINEAR
  const needsMipmaps = [gl.NEAREST_MIPMAP_NEAREST, gl.LINEAR_MIPMAP_NEAREST,
    gl.NEAREST_MIPMAP_LINEAR, gl.LINEAR_MIPMAP_LINEAR].includes(minFilter)
  if (needsMipmaps) gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampler.magFilter ?? gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, sampler.wrapS ?? gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, sampler.wrapT ?? gl.REPEAT)
  return texture
}

// Carrega um .glb e retorna:
// {
//   draws: [{ vao, wireframeVao, wireframeCount, count, indexType, model, baseColor, texture, doubleSided }],
//   bounds: { min: [x,y,z], max: [x,y,z] }   // em espaço de mundo do modelo
// }
export async function loadGLB(gl, url) {
  const data = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`Não foi possível carregar ${url} (${r.status})`)
    return r.arrayBuffer()
  })
  const header = new DataView(data)
  if (header.getUint32(0, true) !== 0x46546C67) throw new Error(`${url} não é um arquivo GLB`)

  let gltf = null
  let bin = null
  for (let offset = 12; offset < data.byteLength;) {
    const length = header.getUint32(offset, true)
    const type = header.getUint32(offset + 4, true)
    const chunk = new Uint8Array(data, offset + 8, length)
    if (type === 0x4E4F534A) gltf = JSON.parse(new TextDecoder().decode(chunk))
    else if (type === 0x004E4942) bin = chunk
    offset += 8 + length
  }

  const images = await Promise.all((gltf.images ?? []).map(async (image) => {
    const view = gltf.bufferViews[image.bufferView]
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    return createImageBitmap(new Blob([bytes], { type: image.mimeType }))
  }))

  const draws = []
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  // matriz de mundo de cada nó (necessária antes de processar as malhas
  // porque o skinning depende dos nós das juntas)
  const worlds = new Map()
  const computeWorlds = (nodeIndex, parentMatrix) => {
    const world = m4.multiply(parentMatrix, nodeMatrix(gltf.nodes[nodeIndex]))
    worlds.set(nodeIndex, world)
    for (const child of gltf.nodes[nodeIndex].children ?? []) computeWorlds(child, world)
  }
  const scene = gltf.scenes[gltf.scene ?? 0]
  for (const nodeIndex of scene.nodes) computeWorlds(nodeIndex, m4.identity())

  const jointMatricesOfSkin = (skinIndex) => {
    const skin = gltf.skins[skinIndex]
    const inverseBinds = skin.inverseBindMatrices !== undefined
      ? readAccessor(gltf, bin, skin.inverseBindMatrices) : null
    return skin.joints.map((jointNode, j) => {
      const inverseBind = inverseBinds ? inverseBinds.subarray(j * 16, j * 16 + 16) : m4.identity()
      return m4.multiply(worlds.get(jointNode), inverseBind)
    })
  }

  for (const [nodeIndex, nodeWorld] of worlds) {
    const node = gltf.nodes[nodeIndex]
    if (node.mesh === undefined) continue
    const skinned = node.skin !== undefined
    const jointMatrices = skinned ? jointMatricesOfSkin(node.skin) : null
    const world = skinned ? m4.identity() : nodeWorld

    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) continue
      const decoded = await decodePrimitive(gltf, bin, primitive)
      const { indices } = decoded
      let positions = decoded.positions
      let normals = decoded.normals ?? computeNormals(positions, indices)
      if (skinned && decoded.joints && decoded.weights) {
        ({ positions, normals } = applySkin(positions, normals, decoded.joints, decoded.weights, jointMatrices))
      }
      const finalUvs = decoded.uvs ?? new Float32Array((positions.length / 3) * 2)

      // os buffers de atributos são compartilhados entre o VAO de triângulos
      // e o VAO de arestas (wireframe); só muda o buffer de índices
      const attributeBuffers = [
        [positions, ATTRIBUTE_LOCATIONS.a_coords, 3],
        [normals, ATTRIBUTE_LOCATIONS.a_normal, 3],
        [finalUvs, ATTRIBUTE_LOCATIONS.a_texcoord, 2]
      ].map(([array, location, size]) => {
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW)
        return { buffer, location, size }
      })
      const createVAO = (elementArray) => {
        const vertexArray = gl.createVertexArray()
        gl.bindVertexArray(vertexArray)
        for (const { buffer, location, size } of attributeBuffers) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
          gl.enableVertexAttribArray(location)
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
        }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elementArray, gl.STATIC_DRAW)
        gl.bindVertexArray(null)
        return vertexArray
      }
      const vao = createVAO(indices)
      const edges = uniqueEdges(indices, positions.length / 3)
      const wireframeVao = createVAO(edges)

      for (let i = 0; i < positions.length; i += 3) {
        const p = m4.transformPoint(world, [positions[i], positions[i + 1], positions[i + 2]])
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[k])
          max[k] = Math.max(max[k], p[k])
        }
      }

      const material = gltf.materials?.[primitive.material] ?? {}
      const pbr = material.pbrMetallicRoughness ?? {}
      draws.push({
        vao,
        wireframeVao,
        wireframeCount: edges.length,
        count: indices.length,
        indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        model: world,
        baseColor: new Float32Array(pbr.baseColorFactor ?? [1, 1, 1, 1]),
        texture: createTexture(gl, gltf, images, pbr.baseColorTexture?.index),
        doubleSided: material.doubleSided ?? false
      })
    }
  }

  return { draws, bounds: { min, max } }
}
