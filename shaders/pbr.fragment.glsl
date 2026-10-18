#version 300 es

precision highp float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec2 v_texcoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec4 u_baseColor;

uniform vec3 u_lightPosition;
uniform vec3 u_lightColor;
uniform float u_lightIntensity;
uniform vec3 u_cameraPosition;
uniform float u_ambient;        // escala da luz do céu
uniform float u_metallic;
uniform float u_roughness;

const float PI = 3.14159265359;

// sky(dir): o mesmo céu procedural que é desenhado ao fundo da cena
// (usado como luz ambiente difusa e como reflexo falso do ambiente)
#include "shaders/sky.glsl"

// D: distribuição de microfacetes GGX (Trowbridge-Reitz)
float distributionGGX(float NdotH, float alpha) {
    float a2 = alpha * alpha;
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (PI * d * d);
}

// G: geometria de Smith com Schlick-GGX (k para luz direta)
float geometrySmith(float NdotV, float NdotL, float roughness) {
    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float gv = NdotV / (NdotV * (1.0 - k) + k);
    float gl = NdotL / (NdotL * (1.0 - k) + k);
    return gv * gl;
}

// F: Fresnel de Schlick
vec3 fresnelSchlick(float cosTheta, vec3 f0) {
    return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

// aproximação analítica (Karis) da tabela de BRDF integrada, para o ambiente
vec3 environmentBRDF(vec3 f0, float roughness, float NdotV) {
    const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
    const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
    vec4 r = roughness * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
    return f0 * ab.x + ab.y;
}

void main() {
    vec4 texel = texture(u_texture, v_texcoord) * u_baseColor;
    vec3 albedo = pow(texel.rgb, vec3(2.2));    // sRGB -> linear
    float metallic = clamp(u_metallic, 0.0, 1.0);
    // evita brilho infinito e divisões por zero com rugosidade 0
    float roughness = clamp(u_roughness, 0.05, 1.0);
    float alpha = roughness * roughness;

    vec3 N = normalize(v_normal);
    if (!gl_FrontFacing) N = -N;    // faces de trás de materiais double-sided
    vec3 V = normalize(u_cameraPosition - v_worldPos);
    float NdotV = max(dot(N, V), 1e-4);
    vec3 f0 = mix(vec3(0.04), albedo, metallic);

    // luz pontual (radiância cai com 1/d²)
    vec3 toLight = u_lightPosition - v_worldPos;
    vec3 L = normalize(toLight);
    vec3 H = normalize(L + V);
    float NdotL = max(dot(N, L), 0.0);
    vec3 radiance = u_lightColor * u_lightIntensity / dot(toLight, toLight);

    float D = distributionGGX(max(dot(N, H), 0.0), alpha);
    float G = geometrySmith(NdotV, NdotL, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), f0);
    vec3 specular = D * G * F / max(4.0 * NdotV * NdotL, 1e-4);
    // conservação de energia: o que é refletido não é difundido; metais não têm difusa
    vec3 kd = (1.0 - F) * (1.0 - metallic);
    vec3 direct = (kd * albedo / PI + specular) * radiance * NdotL;

    // ambiente: céu como luz difusa + reflexo falso do ambiente
    vec3 R = reflect(-V, N);
    vec3 Fenv = fresnelSchlick(NdotV, f0);
    vec3 kdEnv = (1.0 - Fenv) * (1.0 - metallic);
    vec3 diffuseAmbient = kdEnv * albedo * sky(N);
    // rugosidade alta "borra" o reflexo: tende para o céu na direção da normal
    vec3 envColor = mix(sky(R), sky(N), roughness * roughness);
    vec3 specularAmbient = envColor * environmentBRDF(f0, roughness, NdotV);
    vec3 ambient = u_ambient * (diffuseAmbient + specularAmbient);

    vec3 color = direct + ambient;
    color = color / (color + 1.0);              // tone mapping (Reinhard)
    color = pow(color, vec3(1.0 / 2.2));        // linear -> sRGB
    outColor = vec4(color, 1.0);
}
