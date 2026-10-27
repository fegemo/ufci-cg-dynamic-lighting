#version 300 es

precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec2 v_texcoord;
out vec4 o_color;

uniform sampler2D u_texture;    // textura de cor (albedo) do modelo
uniform vec4 u_baseColor;       // fator de cor do material

// câmera e luz (no espaço do mundo)
uniform vec3 u_cameraPosition;
uniform vec3 u_lightPosition;
uniform vec3 u_lightColor;

// coeficientes do material...
// dá para  ajustar estas uniforms pela página
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;

// EXERCÍCIO: este shader apenas devolve o albedo (a cor "pura" do material),
// sem nenhuma iluminação. Implemente aqui o modelo de iluminação de Phong
// (ou Blinn-Phong): ambiente + difusa + especular.
void main() {
    vec3 albedo = (texture(u_texture, v_texcoord) * u_baseColor).rgb;
    
    
    
    
    o_color = vec4(albedo, 1.0);
}
