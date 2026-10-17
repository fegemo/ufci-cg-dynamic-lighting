function rollRight(list=[], times) {
  const result = []
  for (let i = 0; i < list.length; i++) {
    result.push(list[(i-times+list.length)%list.length])
  }
  return result
}

function gridInfo(axis='y', fixedValue=0, distance=20, divisions=200) {
  const dimensionsToRollRight = 'xyz'.indexOf(axis)
  const coords = []
  // se no plano xz (y constante), aqui será a variação de x:
  for (let i = -divisions/2; i < divisions/2; i++) {
    const v0 = [fixedValue, -divisions/2 * distance, i * distance]
    const v1 = [fixedValue, +divisions/2 * distance, i * distance]
    coords.push(
      ...rollRight(v0, dimensionsToRollRight), 
      ...rollRight(v1, dimensionsToRollRight)
    )
  }
  // idem, aqui será variação de z:
  for (let j = -divisions/2; j < divisions/2; j++) {
    const v0 = [fixedValue, j * distance, -divisions/2 * distance]
    const v1 = [fixedValue, j * distance, +divisions/2 * distance]
    coords.push(
      ...rollRight(v0, dimensionsToRollRight), 
      ...rollRight(v1, dimensionsToRollRight)
    )
  }
  
  return {
    coords: new Float32Array(coords),
    draw: gl => {
      gl.drawArrays(gl.LINES, 0, coords.length / 3)
    }
  }
}

function axesInfo(x=0, y=0, z=0, axisLength=2000, showPositive=true, showNegative=true) {
  if (!showPositive && !showNegative) {
    throw new Error('Pelo menos a parte positiva ou negativa precisam estar visíveis em um Axes')
  }
  const coords = []
  const indices = []
  if (showPositive) {
    coords.push(
      0, 0, 0,
      // x positive
      axisLength, 0, 0,
      // y positive
      0, 0, 0,
      0, axisLength, 0,
      // z positive
      0, 0, 0,
      0, 0, axisLength
    )
  }
  
  if (showNegative) {
    coords.push(
      0, 0, 0,
      -axisLength, 0, 0,
      0, 0, 0,
      0, -axisLength, 0,
      0, 0, 0,
      0, 0, -axisLength
    )
  }
  
  let colors = [
    1, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 1, 0,
    0, 0, 1,
    0, 0, 1
  ]
  
  if (showPositive && showNegative) {
    colors = colors.concat(colors)
  }

  const coordsArray = new Float32Array(coords)
  return {
    coords: coordsArray,
    colors: new Float32Array(colors),
    draw: gl => {
      gl.drawArrays(gl.LINES, 0, coordsArray.length / 3)
    }
  }
}

function sphereInfo(x=0, y=0, z=0, radius=0.5, latitudeBands=16, longitudeBands=16) {
  const coords = []
  const colors = []
  const normals = []
  const indices = []
  
  for (let latNumber = 0; latNumber <= latitudeBands; latNumber++) {
    const theta = latNumber * Math.PI / latitudeBands
    const sinTheta = Math.sin(theta)
    const cosTheta = Math.cos(theta)
    
    for (let longNumber = 0; longNumber <= longitudeBands; longNumber++) {
      const phi = longNumber * Math.PI * 2 / longitudeBands
      const sinPhi = Math.sin(phi)
      const cosPhi = Math.cos(phi)
      
      const nx = x + radius * sinTheta * cosPhi
      const ny = y + radius * cosTheta
      const nz = z + radius * sinTheta * sinPhi
      
      coords.push(nx, ny, nz)
      colors.push(0.5, 0.8, 0.7)
      normals.push(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi)
    }
  }
  
  for (let latNumber = 0; latNumber < latitudeBands; latNumber++) {
    for (let longNumber = 0; longNumber < longitudeBands; longNumber++) {
      const first = latNumber * (longitudeBands + 1) + longNumber
      const second = first + longitudeBands + 1
      
      indices.push(first, first + 1, second)
      indices.push(first + 1, second + 1, second)
    }
  }
  
  const coordsArr = new Float32Array(coords)
  const colorsArr = new Float32Array(colors)
  const normalsArr = new Float32Array(normals)
  const indicesArr = new Uint16Array(indices)
  
  return {
    coords: coordsArr,
    colors: colorsArr,
    normals: normalsArr,
    indices: indicesArr,
    draw(gl, primitiveType=gl.TRIANGLES) {
      gl.drawElements(primitiveType, indicesArr.length, gl.UNSIGNED_SHORT, 0)
    }
  }
}

export function grid(gl, programInfo, axis='y', fixedValue=0, distance=20, divisions=200) {
  const geometry = gridInfo(axis, fixedValue, distance, divisions)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  
  // coords
  const coordsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, coordsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.coords, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_coords)
  gl.vertexAttribPointer(programInfo.locations.a_coords, 3, gl.FLOAT, false, 0, 0)

  const color = new Float32Array([0.5, 0.5, 0.5])

  return {
    vao,
    draw(gl) {
      gl.uniform1i(programInfo.locations.u_illuminated, 0)
      gl.uniform1f(programInfo.locations.u_alpha, 0.3)
      gl.uniform1i(programInfo.locations.u_usePerVertexColor, 0)
      gl.uniform3fv(programInfo.locations.u_color, color)
      geometry.draw(gl)
    }
  }
}


export function axes(gl, programInfo, x, y, z, axisLength, showPositive, showNegative) {
  const geometry = axesInfo(x, y, z, axisLength, showPositive, showNegative)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  
  // coords
  const coordsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, coordsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.coords, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_coords)
  gl.vertexAttribPointer(programInfo.locations.a_coords, 3, gl.FLOAT, false, 0, 0)
  
  // colors
  const colorsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, colorsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.colors, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_color)
  gl.vertexAttribPointer(programInfo.locations.a_color, 3, gl.FLOAT, false, 0, 0)
  
  return {
    vao,
    draw(gl) {
      gl.uniform1i(programInfo.locations.u_illuminated, 0)
      gl.uniform1f(programInfo.locations.u_alpha, 0.6)
      gl.uniform1i(programInfo.locations.u_usePerVertexColor, 1)
      geometry.draw(gl)
      gl.uniform1f(programInfo.locations.u_alpha, 1.0)
    }
  }
}

export function sphere(gl, programInfo, x=0, y=0, z=0, radius=1, segments=32) {
  const geometry = sphereInfo(x, y, z, radius, segments)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  
  // coords
  const coordsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, coordsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.coords, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_coords)
  gl.vertexAttribPointer(programInfo.locations.a_coords, 3, gl.FLOAT, false, 0, 0)
  
  // colors
  const colorsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, colorsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.colors, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_color)
  gl.vertexAttribPointer(programInfo.locations.a_color, 3, gl.FLOAT, false, 0, 0)
  
  // normals
  const normalsVBO = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, normalsVBO)
  gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(programInfo.locations.a_normal)
  gl.vertexAttribPointer(programInfo.locations.a_normal, 3, gl.FLOAT, false, 0, 0)
  
  // indices
  const ibo = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW)
  
  const wireframeColor = new Float32Array([0.2, 0.2, 0.2])
  return {
    vao,
    draw(gl, wireframe=false) {
      gl.uniform1f(programInfo.locations.u_alpha, 1.0)
      geometry.draw(gl)
      if (wireframe) {
        gl.uniform3fv(programInfo.locations.u_color, wireframeColor)
        gl.uniform1f(programInfo.locations.u_alpha, 0.3)
        geometry.draw(gl, gl.LINE_STRIP)
        gl.uniform1f(programInfo.locations.u_alpha, 1.0)
      }
    }
  }
}