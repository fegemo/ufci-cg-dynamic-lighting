#version 300 es

precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec2 v_texcoord;
out vec4 o_color;

uniform sampler2D u_texture;
uniform vec4 u_baseColor;

uniform vec3 u_lightPosition;
uniform vec3 u_lightColor;
uniform vec3 u_cameraPosition;

uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;

void main() {
    vec3 albedo = (texture(u_texture, v_texcoord) * u_baseColor).rgb;

    // a interpolação desnormaliza o vetor: renormalizamos por fragmento
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightPosition - v_worldPos);
    vec3 V = normalize(u_cameraPosition - v_worldPos);
    vec3 R = reflect(-L, N);

    vec3 ambient = u_ambient * u_lightColor * albedo;

    float diffuseFactor = max(dot(N, L), 0.0);
    vec3 diffuse = u_diffuse * diffuseFactor * u_lightColor * albedo;

    float specularFactor = diffuseFactor > 0.0 ? pow(max(dot(R, V), 0.0), u_shininess) : 0.0;
    vec3 specular = u_specular * specularFactor * u_lightColor;

    o_color = vec4(ambient + diffuse + specular, 1.0);
}
