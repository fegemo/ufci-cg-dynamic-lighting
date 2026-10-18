// céu procedural: gradiente chão -> horizonte -> zênite, mais um "sol" fraco.
// Incluído (#include "sky.glsl") pelo shader do fundo e pelo shader PBR, para
// que o que se vê ao fundo seja exatamente o que ilumina e reflete nos modelos.
vec3 sky(vec3 dir) {
    vec3 zenith = vec3(0.25, 0.45, 0.95);
    vec3 horizon = vec3(0.85, 0.85, 0.9);
    vec3 ground = vec3(0.12, 0.10, 0.09);
    float h = dir.y;
    vec3 color = h > 0.0 ? mix(horizon, zenith, pow(h, 0.5)) : mix(horizon, ground, pow(-h, 0.4));
    float sun = pow(max(dot(dir, normalize(vec3(0.5, 0.8, 0.3))), 0.0), 64.0);
    return color + sun * vec3(1.0, 0.9, 0.7) * 2.0;
}
