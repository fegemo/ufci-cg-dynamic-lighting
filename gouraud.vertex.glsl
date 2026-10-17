#version 300 es

// Gouraud: a iluminação (Phong) é calculada por VÉRTICE e as cores
// resultantes são interpoladas pelos fragmentos.

layout(location = 0) in vec3 a_coords;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texcoord;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

uniform vec3 u_lightPosition;
uniform vec3 u_lightColor;
uniform vec3 u_cameraPosition;
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;

out vec3 v_diffuseAndAmbient;   // (ka + kd * max(N·L, 0)) * cor da luz
out vec3 v_specular;            // ks * max(R·V, 0)^n * cor da luz
out vec2 v_texcoord;

void main() {
    mat3 normalMatrix = transpose(inverse(mat3(u_model)));
    vec3 worldPos = (u_model * vec4(a_coords, 1.0)).xyz;
    vec3 N = normalize(normalMatrix * a_normal);
    vec3 L = normalize(u_lightPosition - worldPos);
    vec3 V = normalize(u_cameraPosition - worldPos);
    vec3 R = reflect(-L, N);

    float diffuse = max(dot(N, L), 0.0);
    // sem a verificação de diffuse > 0, haveria brilho "atrás" da superfície
    float specular = diffuse > 0.0 ? pow(max(dot(R, V), 0.0), u_shininess) : 0.0;

    v_diffuseAndAmbient = (u_ambient + u_diffuse * diffuse) * u_lightColor;
    v_specular = u_specular * specular * u_lightColor;
    v_texcoord = a_texcoord;
    gl_Position = u_projection * u_view * u_model * vec4(a_coords, 1.0);
}
