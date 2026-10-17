import { m4 } from '../twgl.full.module.js'

export function interpolateMatrices(m1, m2, t) {
    return m1.map((v1, c) => {
        const v2 = m2[c]
        return (1-t)*v1 + t*v2
    })
}

export function interpolateCameras(cam1, cam2, t) {
    const pos = interpolateMatrices(cam1.position, cam2.position, t)
    const target = interpolateMatrices(cam1.target, cam2.target, t)
    const up = interpolateMatrices(cam1.up, cam2.up, t)
    
    const lookAtMatrix = m4.lookAt(pos, target, up)
    return m4.inverse(lookAtMatrix)
}