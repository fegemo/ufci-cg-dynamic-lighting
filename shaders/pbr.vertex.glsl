#version 300 es

// Phong/Blinn-Phong: o vertex shader apenas repassa normal e posição (em
// espaço de mundo); a iluminação é calculada por FRAGMENTO.

layout(location = 0) in vec3 a_coords;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texcoord;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 v_normal;
out vec3 v_worldPos;
out vec2 v_texcoord;

void main() {
    mat3 normalMatrix = transpose(inverse(mat3(u_model)));
    v_normal = normalMatrix * a_normal;
    v_worldPos = (u_model * vec4(a_coords, 1.0)).xyz;
    v_texcoord = a_texcoord;
    gl_Position = u_projection * u_view * u_model * vec4(a_coords, 1.0);
}
