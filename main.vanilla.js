import { createProgramFromFiles, setupWebGL } from './vanilla-utils/shader.js'
import { createShader, createProgram } from './vanilla-utils/shader.js'
import { sphere } from './vanilla-utils/geometry.js'
import { loadGLB, ATTRIBUTE_LOCATIONS } from './vanilla-utils/gltf.js'
import { m4, v3 } from './twgl.full.module.js'
// m4 é o utilitário de matrizes da TWGL.js: https://twgljs.org/docs/module-twgl_m4.html
// v3 é o utilitário de ponto ou vetor de 3D: https://twgljs.org/docs/module-twgl_v3.html

export { setupWebGL }

const UNIFORMS = [
    'u_model', 'u_view', 'u_projection',
    'u_texture', 'u_baseColor',
    'u_lightPosition', 'u_lightColor', 'u_cameraPosition',
    'u_ambient', 'u_diffuse', 'u_specular', 'u_shininess'
]

const state = {
    // programas shader: um por técnica de iluminação, todos compartilham os
    // mesmos uniformes e os mesmos atributos (veja ATTRIBUTE_LOCATIONS)
    shaders: {
        options: [
            // o "albedo" (vertex.glsl e fragment.glsl) é o ponto de partida do exercício
            { name: 'Albedo (sem iluminação)', prefix: '' },
            { name: 'Gouraud', prefix: 'gouraud.' },
            { name: 'Phong', prefix: 'phong.' },
            { name: 'Blinn-Phong', prefix: 'blinn-phong.' }
        ],
        selected: 0,
        programs: []    // { id, locations } para cada opção
    },
    // fundo: céu procedural desenhado com um triângulo de tela cheia
    sky: {
        program: null,
        invViewProjectionLocation: null,
        ambientLocation: null,
        vao: null
    },
    // programa simples que desenha o marcador da luz
    lightMarker: {
        program: null,
        locations: {},
        geometry: null
    },
    // modelo gltf: lista de draws, matriz que o centraliza e normaliza
    model: {
        draws: [],
        matrix: m4.identity(),
        options: [
            { name: 'Sprigatito', url: './models/sprigatito.glb' },
            { name: 'Bulbasaur', url: './models/bulbasaur.glb' },
            { name: 'Voltorb', url: './models/voltorb.glb' }
            // adicione outros modelos .glb aqui e eles aparecem no seletor
        ],
        selected: 0,
        loadCount: 0
    },
    wireframe: false,               // mostrar as arestas do modelo
    // câmera orbital ao redor da origem (centro do modelo)
    camera: {
        autoRotate: true,
        autoRotateSpeed: 0.5,       // radianos por segundo
        azimuth: Math.PI / 6,       // ângulo horizontal
        elevation: 0.3,             // ângulo vertical
        distance: 4,
        minDistance: 1.5,
        maxDistance: 12,
        target: [0, 0, 0],
        position: [0, 0, 0],
        viewMatrix: m4.identity()
    },
    // luz pontual
    light: {
        position: [1.2, 1.5, 1.5],
        color: [1, 1, 1],
        orbit: false,               // luz girando em torno do modelo
        orbitAngle: 0,
        orbitSpeed: 1.0,
        orbitRadius: 3.5,
        height: 2
    },
    // parâmetros do modelo de iluminação
    lighting: {
        ambient: 0.4,           // também é a intensidade do céu
        diffuse: 0.8,
        specular: 0.5,
        shininess: 32
    },
    // estado das teclas de controle da cena
    keys: {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        KeyR: false,
        KeyL: false,
        KeyS: false,
        KeyW: false
    }
}

const wireframeColor = new Float32Array([0, 0, 0])

function selectedProgram() {
    return state.shaders.programs[Number(state.shaders.selected)]
}

async function createShaderProgram(gl, prefix) {
    const id = await createProgramFromFiles(gl, `${prefix}vertex.glsl`, `${prefix}fragment.glsl`)
    const locations = {}
    for (const name of UNIFORMS) locations[name] = gl.getUniformLocation(id, name)
    return { id, locations }
}

async function createSky(gl) {
    const id = await createProgramFromFiles(gl, 'sky.vertex.glsl', 'sky.fragment.glsl')
    state.sky.program = id
    state.sky.invViewProjectionLocation = gl.getUniformLocation(id, 'u_invViewProjection')
    state.sky.ambientLocation = gl.getUniformLocation(id, 'u_ambient')
    // o triângulo é gerado no vertex shader, mas o WebGL exige um VAO ligado
    state.sky.vao = gl.createVertexArray()
}

function drawSky(gl) {
    const { camera, sky } = state
    // só a rotação da câmera importa: o céu está "infinitamente" longe
    const rotationOnly = m4.copy(camera.viewMatrix)
    rotationOnly[12] = rotationOnly[13] = rotationOnly[14] = 0
    const invViewProjection = m4.inverse(m4.multiply(state.projectionMatrix, rotationOnly))

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.useProgram(sky.program)
    gl.uniformMatrix4fv(sky.invViewProjectionLocation, false, invViewProjection)
    gl.uniform1f(sky.ambientLocation, state.lighting.ambient)
    gl.bindVertexArray(sky.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.enable(gl.DEPTH_TEST)
}

function createLightMarker(gl) {
    const vs = createShader(gl, 'marker-vs', gl.VERTEX_SHADER, `#version 300 es
        layout(location = 0) in vec3 a_coords;
        uniform mat4 u_model;
        uniform mat4 u_view;
        uniform mat4 u_projection;
        void main() { gl_Position = u_projection * u_view * u_model * vec4(a_coords, 1.0); }`)
    const fs = createShader(gl, 'marker-fs', gl.FRAGMENT_SHADER, `#version 300 es
        precision mediump float;
        uniform vec3 u_lightColor;
        out vec4 outColor;
        void main() { outColor = vec4(u_lightColor, 1.0); }`)
    const id = createProgram(gl, vs, fs)
    const locations = {}
    for (const name of ['u_model', 'u_view', 'u_projection', 'u_lightColor']) {
        locations[name] = gl.getUniformLocation(id, name)
    }
    state.lightMarker.program = id
    state.lightMarker.locations = locations
    // a esfera usa as localizações de atributos abaixo (os mesmos do glTF)
    state.lightMarker.geometry = sphere(gl, {
        locations: { a_coords: ATTRIBUTE_LOCATIONS.a_coords, a_normal: ATTRIBUTE_LOCATIONS.a_normal, a_color: 3 }
    }, 0, 0, 0, 0.08, 16)
}

// centraliza o modelo na origem e o escala para caber numa esfera de raio 1
function normalizationMatrix({ min, max }) {
    const center = v3.mulScalar(v3.add(min, max), 0.5)
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    const model = m4.scaling([2 / size, 2 / size, 2 / size])
    return m4.translate(model, v3.negate(center))
}

export async function initialize(gl) {
    // cria os programas shader a partir de arquivos
    state.shaders.programs = await Promise.all(
        state.shaders.options.map(option => createShaderProgram(gl, option.prefix))
    )
    createLightMarker(gl)
    await createSky(gl)

    await loadModel(gl, Number(state.model.selected))

    // inicializa o estado da aplicação
    gl.enable(gl.DEPTH_TEST)

    // projeção perspectiva (a mesma para todos os programas)
    const fovY = Math.PI / 3    // 60 graus
    const aspectRatio = gl.canvas.width / gl.canvas.height
    state.projectionMatrix = m4.perspective(fovY, aspectRatio, 0.1, 100)

    updateCameraMatrix()
    initializeEvents(gl)
}

async function loadModel(gl, index) {
    // se o usuário trocar de modelo durante o carregamento, só o último vale
    const loadId = ++state.model.loadCount
    const { draws, bounds } = await loadGLB(gl, state.model.options[index].url)
    if (loadId !== state.model.loadCount) return
    state.model.draws = draws
    state.model.matrix = normalizationMatrix(bounds)
}

function initializeEvents(gl) {
    document.getElementById('input-model').addEventListener('change', (e) => {
        loadModel(gl, e.target.selectedIndex).catch(console.error)
    });

    // teclado:
    // - 'R': liga/desliga a rotação automática da câmera
    // - 'L': liga/desliga a luz orbitando
    // - 'W': liga/desliga o wireframe
    // - 'S': alterna entre os shaders
    // - setas: controlam a câmera (e pausam a rotação automática)
    ['keydown', 'keyup'].forEach((nameOfEvent) => {
        window.addEventListener(nameOfEvent, (e) => {
            if (e.target.matches?.('input, select, textarea')) return
            if (e.code in state.keys) {
                state.keys[e.code] = (nameOfEvent === 'keydown')
                // evita que a página role ao pressionar as setas
                e.preventDefault()
            }
            if (nameOfEvent !== 'keydown' || e.repeat) return

            if (e.code === 'KeyR') {
                state.camera.autoRotate = !state.camera.autoRotate
            }
            if (e.code === 'KeyL') {
                state.light.orbit = !state.light.orbit
            }
            if (e.code === 'KeyW') {
                state.wireframe = !state.wireframe
            }
            if (e.code === 'KeyS') {
                state.shaders.selected = (Number(state.shaders.selected) + 1) % state.shaders.options.length
            }
        })
    })

    // mouse/toque na tela: arrastar gira a câmera, rolar dá zoom.
    // interagir pausa a rotação automática (retome com a tecla R ou o checkbox)
    const canvas = gl.canvas
    canvas.style.touchAction = 'none'
    const pointers = new Map()
    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId)
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        state.camera.autoRotate = false
    })
    canvas.addEventListener('pointermove', (e) => {
        const last = pointers.get(e.pointerId)
        if (!last) return
        orbit(-(e.clientX - last.x) * 0.01, (e.clientY - last.y) * 0.01)
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    })
    const release = (e) => pointers.delete(e.pointerId)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault()
        zoom(Math.exp(e.deltaY * 0.001))
    }, { passive: false })
}

function orbit(deltaAzimuth, deltaElevation) {
    const camera = state.camera
    camera.azimuth += deltaAzimuth
    const limit = Math.PI / 2 - 0.05
    camera.elevation = Math.max(-limit, Math.min(limit, camera.elevation + deltaElevation))
}

function zoom(factor) {
    const camera = state.camera
    camera.distance = Math.max(camera.minDistance, Math.min(camera.maxDistance, camera.distance * factor))
}

function updateCameraMatrix() {
    const camera = state.camera
    const { azimuth, elevation, distance, target } = camera
    camera.position = [
        target[0] + distance * Math.cos(elevation) * Math.sin(azimuth),
        target[1] + distance * Math.sin(elevation),
        target[2] + distance * Math.cos(elevation) * Math.cos(azimuth)
    ]
    camera.viewMatrix = m4.inverse(m4.lookAt(camera.position, target, [0, 1, 0]))
}

export function render(gl) {
    gl.clear(gl.DEPTH_BUFFER_BIT)
    drawSky(gl)

    const { id, locations } = selectedProgram()
    const { camera, light, lighting } = state
    gl.useProgram(id)

    // uniformes que valem para a cena toda
    gl.uniformMatrix4fv(locations.u_view, false, camera.viewMatrix)
    gl.uniformMatrix4fv(locations.u_projection, false, state.projectionMatrix)
    gl.uniform3fv(locations.u_lightPosition, light.position)
    gl.uniform3fv(locations.u_lightColor, light.color)
    gl.uniform3fv(locations.u_cameraPosition, camera.position)
    gl.uniform1f(locations.u_ambient, lighting.ambient)
    gl.uniform1f(locations.u_diffuse, lighting.diffuse)
    gl.uniform1f(locations.u_specular, lighting.specular)
    gl.uniform1f(locations.u_shininess, lighting.shininess)
    gl.uniform1i(locations.u_texture, 0)

    // desenha o modelo: cada draw tem sua própria matriz (hierarquia do gltf)
    for (const draw of state.model.draws) {
        gl.uniformMatrix4fv(locations.u_model, false, m4.multiply(state.model.matrix, draw.model))
        gl.uniform4fv(locations.u_baseColor, draw.baseColor)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, draw.texture)
        if (draw.doubleSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE)
        gl.bindVertexArray(draw.vao)
        // com wireframe, afasta um pouco os triângulos para as linhas não "brigarem" no z-buffer
        if (state.wireframe) {
            gl.enable(gl.POLYGON_OFFSET_FILL)
            gl.polygonOffset(1, 1)
        }
        gl.drawElements(gl.TRIANGLES, draw.count, draw.indexType, 0)
        gl.disable(gl.POLYGON_OFFSET_FILL)
    }

    // wireframe: redesenha as arestas por cima, com a cor "flat" do marcador
    if (state.wireframe) {
        const marker = state.lightMarker
        gl.useProgram(marker.program)
        gl.uniformMatrix4fv(marker.locations.u_view, false, camera.viewMatrix)
        gl.uniformMatrix4fv(marker.locations.u_projection, false, state.projectionMatrix)
        gl.uniform3fv(marker.locations.u_lightColor, wireframeColor)
        for (const draw of state.model.draws) {
            gl.uniformMatrix4fv(marker.locations.u_model, false, m4.multiply(state.model.matrix, draw.model))
            gl.bindVertexArray(draw.wireframeVao)
            gl.drawElements(gl.LINES, draw.wireframeCount, gl.UNSIGNED_INT, 0)
        }
    }

    // desenha uma pequena esfera na posição da luz
    const marker = state.lightMarker
    gl.useProgram(marker.program)
    gl.disable(gl.CULL_FACE)
    gl.uniformMatrix4fv(marker.locations.u_view, false, camera.viewMatrix)
    gl.uniformMatrix4fv(marker.locations.u_projection, false, state.projectionMatrix)
    gl.uniformMatrix4fv(marker.locations.u_model, false, m4.translation(light.position))
    gl.uniform3fv(marker.locations.u_lightColor, light.color)
    gl.bindVertexArray(marker.geometry.vao)
    marker.geometry.draw(gl)
    gl.bindVertexArray(null)
}

export function update(dt) {
    const { camera, light, keys } = state
    dt = Math.min(dt, 0.1)  // evita saltos quando a aba fica em segundo plano

    // controles pelo teclado também pausam a rotação automática
    const keyboardSpeed = 1.5
    const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)
    const dy = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)
    if (dx || dy) {
        camera.autoRotate = false
        orbit(dx * keyboardSpeed * dt, dy * keyboardSpeed * dt)
    }

    if (camera.autoRotate) {
        camera.azimuth += camera.autoRotateSpeed * dt
    }
    updateCameraMatrix()

    if (light.orbit) {
        light.orbitAngle += light.orbitSpeed * dt
        light.position = [
            light.orbitRadius * Math.cos(light.orbitAngle),
            light.height,
            light.orbitRadius * Math.sin(light.orbitAngle)
        ]
    }
}

// ℹ️ necessário apenas para o exemplo, e não para uma aplicação real: 
// expõe o estado para uso na interface (via data-binding)
export { state }
