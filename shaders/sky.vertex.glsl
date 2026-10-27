#version 300 es

// Este shader não recebe nenhum atributo de vértice, 
// nem mesmo posição, nem normal, nem coordenada de textura...
//    
// Mas, ao chamarmos glDrawArrays(GL_TRIANGLES, 0, 3), o WebGL gera 3 vértices
// com gl_VertexID = 0, 1, 2.
//
// A partir disso, podemos gerar um triângulo que cobre a tela toda. Se ele
// tiver coordenadas (-1,-1), (3,-1), (-1,3), cobre toda a tela e 
// sobra uma parte fora da tela, que é descartada pelo rasterizador.
// (desenha aí no papel procê vê)

uniform mat4 u_invViewProjection;   // inversa de projection * view (sem translação)

out vec3 v_direction;

void main() {
    float x = float((gl_VertexID << 1) & 2);
    float y = float(gl_VertexID & 2);
    vec4 coords = vec4(vec2(x, y) * 2.0 - 1.0, 0.0, 1.0);
    gl_Position = coords;
    
    // direção do raio de visão em espaço de mundo (ponto no plano far)
    vec4 world = u_invViewProjection * coords;
    v_direction = world.xyz / world.w;
}
