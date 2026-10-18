#version 300 es

// Triângulo que cobre a tela toda, gerado a partir de gl_VertexID (sem buffers):
// os vértices 0, 1, 2 viram (-1,-1), (3,-1), (-1,3) em coordenadas de clip.

uniform mat4 u_invViewProjection;   // inversa de projection * view (sem translação)

out vec3 v_direction;

void main() {
    vec2 clip = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    gl_Position = vec4(clip, 1.0, 1.0);
    // direção do raio de visão em espaço de mundo (ponto no plano far)
    vec4 world = u_invViewProjection * vec4(clip, 1.0, 1.0);
    v_direction = world.xyz / world.w;
}
