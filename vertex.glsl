#version 300 es

layout(location = 0) in vec3 a_coords;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texcoord;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

// ℹ️ uniformes disponíveis para você usar na iluminação (declare-os aqui ou
// no fragment shader, conforme necessário):
//   uniform vec3  u_lightPosition;   // posição da luz (espaço de mundo)
//   uniform vec3  u_lightColor;      // cor da luz
//   uniform vec3  u_cameraPosition;  // posição da câmera (espaço de mundo)
//   uniform float u_ambient;         // intensidade da luz ambiente (ka)
//   uniform float u_diffuse;         // intensidade da luz difusa (kd)
//   uniform float u_specular;        // intensidade da luz especular (ks)
//   uniform float u_shininess;       // brilho, o expoente especular (n)

out vec3 v_normal;
out vec3 v_worldPos;
out vec2 v_texcoord;

void main() {
    // normais não são transformadas pela matriz de modelo diretamente:
    // precisamos da inversa transposta (para escalas não uniformes)
    mat3 normalMatrix = transpose(inverse(mat3(u_model)));
    v_normal = normalMatrix * a_normal;
    v_worldPos = (u_model * vec4(a_coords, 1.0)).xyz;
    v_texcoord = a_texcoord;
    gl_Position = u_projection * u_view * u_model * vec4(a_coords, 1.0);
}
