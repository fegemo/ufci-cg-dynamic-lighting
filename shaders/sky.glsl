// céu procedural: gradiente chão -> horizonte -> zênite, mais um "sol" fraco.
// Incluído (#include "sky.glsl") pelo shader do fundo e pelo shader PBR, para
// garantir que o que se vê ao fundo seja exatamente 
// o que ilumina e reflete nos modelos
//
// Atenção: não existe #include em GLSL... foi feita uma substituição de texto 
// logo antes da compilação do shader (tipo um preprocessador)
vec3 sky(vec3 direction) {
    // características do céu
    vec3 colorAtZenith = vec3(0.25, 0.45, 0.95);
    vec3 colorAtHorizon = vec3(0.85, 0.85, 0.9);
    vec3 colorAtGround = vec3(0.12, 0.10, 0.09);
    
    // características do sol
    vec3 directionectionToSun = normalize(vec3(0.5, 0.8, 0.3));
    vec3 sunColor = vec3(1.0, 0.9, 0.7);

    // h: altura de para onde estamos olhando: -1 chão, 1 zênite
    float h = direction.y;

    // cor do céu na direção do olhar: interpolação entre chão, horizonte e zênite
    vec3 skyColorAtDirection = h > 0.0 ? 
        mix(colorAtHorizon, colorAtZenith, pow(h, 0.5)) : 
        mix(colorAtHorizon, colorAtGround, pow(-h, 0.4));

    // cor do sol na direção do olhar: quanto mais próximo do sol, mais forte a cor do sol
    // e concentra o brilho ao elevar a uma potência alta
    float sunColorAtDirection = pow(max(0.0, dot(direction, directionectionToSun)), 64.0);

    return skyColorAtDirection + sunColorAtDirection * sunColor * 2.0;
}
