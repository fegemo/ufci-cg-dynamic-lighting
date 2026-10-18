#version 300 es

precision highp float;

#include "sky.glsl"

in vec3 v_direction;
out vec4 o_color;

uniform float u_ambient;    // intensidade do céu (o mesmo slider de ambiente)

void main() {
    // mesmo tratamento do shader PBR: tone mapping (Reinhard) e gama
    vec3 color = u_ambient * sky(normalize(v_direction));
    color = color / (color + 1.0);
    o_color = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}
