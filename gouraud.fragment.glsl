#version 300 es

precision highp float;

in vec3 v_diffuseAndAmbient;
in vec3 v_specular;
in vec2 v_texcoord;
out vec4 o_color;

uniform sampler2D u_texture;
uniform vec4 u_baseColor;

void main() {
    vec3 albedo = (texture(u_texture, v_texcoord) * u_baseColor).rgb;
    o_color = vec4(albedo * v_diffuseAndAmbient + v_specular, 1.0);
}
