#version 300 es

precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec2 v_texcoord;
out vec4 outColor;

uniform sampler2D u_texture;    // textura de cor (albedo) do modelo
uniform vec4 u_baseColor;       // fator de cor do material

// EXERCÍCIO: este shader apenas devolve o albedo (a cor "pura" do material),
// sem nenhuma iluminação. Implemente aqui o modelo de iluminação de Phong
// (ou Blinn-Phong): ambiente + difusa + especular.
void main() {
    vec4 albedo = texture(u_texture, v_texcoord) * u_baseColor;
    outColor = vec4(albedo.rgb, 1.0);
}
