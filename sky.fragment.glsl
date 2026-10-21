#version 300 es

precision highp float;

#include "sky.glsl"

in vec3 v_direction;
out vec4 o_color;

uniform float u_ambient;    // intensidade do céu (o mesmo slider de ambiente)

void main() {
    // acha a cor do céu na direção do raio de visão
    vec3 color = u_ambient * sky(normalize(v_direction));

    // normaliza para que a cor fique garantidamente [0,1]
    color = color / (color + 1.0);

    // aplica correção gama (gamma correction)
    o_color = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
