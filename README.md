# Iluminação Dinâmica

Vamos iluminar um modelo 3D para exercitar a **iluminação dinâmica**. Em vez de
a cor de cada pixel vir "pronta" da textura do modelo (o *albedo*), ela passa a
ser calculada nos shaders a partir de uma luz, da posição da câmera e da
orientação (normal) da superfície naquele ponto.

A cena mostra um modelo glTF (`sprigatito.glb`, `bulbasaur.glb` ou `voltorb.glb`, em `models/`, à sua escolha no seletor) com uma **câmera
orbital** que gira automaticamente ao redor dele, e uma luz pontual (a esfera
pequena). Você pode:

- arrastar o mouse (ou o dedo) para girar a câmera e usar a roda para dar zoom
  (ao interagir, a rotação automática é pausada);
- apertar <kbd>R</kbd> (ou usar o checkbox) para retomar/pausar a rotação
  automática;
- apertar <kbd>L</kbd> para fazer a luz orbitar o modelo;
- apertar <kbd>W</kbd> (ou usar o checkbox) para mostrar/ocultar o wireframe;
- apertar <kbd>S</kbd> (ou usar o seletor) para alternar entre os shaders;
- ajustar a cor da luz e os coeficientes ambiente, difuso, especular e o brilho.

Para usar outro modelo, coloque um `.glb` em `models/` e inclua-o em `model.options`
no `state` do `main.vanilla.js`. O modelo é automaticamente centralizado e
escalado para caber na cena.


## Modelos de iluminação

A cor final de um fragmento é a soma de três componentes (cada uma multiplicada
pela cor da luz). Com os vetores **normalizados** (todos saindo do ponto
da superfície):

- `N`: normal da superfície
- `L`: direção para a luz
- `V`: direção para a câmera
- `R`: direção de reflexão da luz, `reflect(-L, N)`
- `H`: vetor "meio" (*half-vector*), `normalize(L + V)`

| Componente | Cálculo                                       |
|------------|-----------------------------------------------|
| Ambiente   | `ka * corDaLuz * albedo`                      |
| Difusa     | `kd * max(dot(N, L), 0) * corDaLuz * albedo`  |
| Especular  | `ks * max(dot(R, V), 0)^n * corDaLuz`         |

A diferença entre as técnicas está em **onde** e **como** a conta é feita:

1. **Gouraud**: a iluminação é calculada no *vertex shader*, por vértice, e a
   **cor** resultante é interpolada entre os vértices. É barato, mas perde
   brilhos que "caem" no meio de um triângulo.
1. **Phong**: o *vertex shader* só repassa a normal e a posição (em espaço de
   mundo) e a iluminação é calculada no *fragment shader*, por fragmento, com a
   normal interpolada (e renormalizada!). Especular com `R · V`.
1. **Blinn-Phong**: igual ao Phong, mas o especular usa `N · H` no lugar de
   `R · V`. É mais barato e costuma ter um brilho mais suave (use um `n`
   maior para compensar).


## Exercício

Você deve fazer a atividade nos arquivos `vertex.glsl` e `fragment.glsl`,
que hoje desenham apenas o albedo (sem iluminação, a opção "Albedo" do
seletor). Dê uma olhada também no `main.vanilla.js` para ver como os uniformes
são enviados aos shaders.

Os uniformes disponíveis são:

| Uniforme            | Tipo        | Descrição                                  |
|---------------------|-------------|--------------------------------------------|
| `u_model`           | `mat4`      | modelo → mundo                             |
| `u_view`            | `mat4`      | mundo → câmera                             |
| `u_projection`      | `mat4`      | câmera → clip                              |
| `u_texture`         | `sampler2D` | textura de cor (albedo)                    |
| `u_baseColor`       | `vec4`      | fator de cor do material                   |
| `u_lightPosition`   | `vec3`      | posição da luz (espaço de mundo)           |
| `u_lightColor`      | `vec3`      | cor da luz                                 |
| `u_cameraPosition`  | `vec3`      | posição da câmera (espaço de mundo)        |
| `u_ambient`         | `float`     | `ka`: intensidade ambiente                 |
| `u_diffuse`         | `float`     | `kd`: intensidade difusa                   |
| `u_specular`        | `float`     | `ks`: intensidade especular                |
| `u_shininess`       | `float`     | `n`: brilho (expoente especular)           |

ℹ️ Os atributos dos vértices têm localização fixa:
`layout(location = 0) in vec3 a_coords`, `location = 1` para `a_normal` e
`location = 2` para `a_texcoord`. Todos os cálculos de iluminação devem ser
feitos no **espaço de mundo**.

Vamos lá:

- Exercício 0: Cor de Fundo
    - Procure onde está definida a cor de fundo da cena (`gl.clearColor`) e
      troque por outra cor. A ideia é se familiarizar com o arquivo.
- Exercício 1: Luz Ambiente
    - No `fragment.glsl`, declare os uniformes `u_lightColor` e `u_ambient` e
      devolva a componente ambiente em vez do albedo puro. Repare que o modelo
      todo fica "chapado": não há noção de forma ainda.
- Exercício 2: Luz Difusa (Phong)
    - Use `v_normal` e `v_worldPos` (já repassados pelo vertex shader) e
      calcule `N` e `L` no fragment shader. **Normalize** a normal interpolada.
    - Some a componente difusa. Use `max(..., 0.0)` para evitar luz negativa.
    - Dica: `u_lightPosition` e `v_worldPos` estão no mesmo espaço (mundo).
- Exercício 3: Luz Especular (Phong)
    - Calcule `V` com `u_cameraPosition` e `R` com `reflect(-L, N)`.
    - Some o especular, `pow(max(dot(R, V), 0.0), u_shininess)`.
    - Teste variar o brilho `n` e o `ks` na interface. Olhe o modelo girando:
      o brilho acompanha a câmera.
- Exercício 4: Blinn-Phong
    - Troque `R · V` por `N · H`. Compare as duas versões. O que muda no
      brilho para o mesmo `n`?
- Desafio 1: Gouraud
    - Mova o cálculo da iluminação para o vertex shader e passe ao fragment
      shader apenas o resultado a ser interpolado. Compare com o Phong
      em um modelo com poucos vértices: o que acontece com o brilho especular?
- Desafio 2: Atenuação
    - Faça a luz perder intensidade com a distância, por exemplo
      `1.0 / (1.0 + k * distancia²)`.
- Desafio 3: Mais luzes
    - Adicione uma segunda luz (uniformes novos no `main.vanilla.js`) com
      outra cor e posição.

Para conferir seu resultado, os arquivos `gouraud.*`, `phong.*` e
`blinn-phong.*` (`.vertex.glsl` e `.fragment.glsl`) são implementações de
referência, selecionáveis na interface. Só espie **depois** de tentar. 😉

ℹ️ Observação: estamos usando o utilitário matemático da
TWGL.js. Em particular, para matrizes 4x4 ([m4][m4-docs]) e
para ponto/vetor de 3 dimensões ([v3][v3-docs]).


## Créditos

- Modelo [Sprigatito](https://sketchfab.com/3d-models/sprigatito-f479fde14dee41678892cb192f7eecac)
  por Squirmy Worm, licença [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
- Modelo [Voltorb](https://sketchfab.com/3d-models/voltorb-cd8079ed3d664a738b6c694504e2ef28)
  por nguyenlouis32, licença CC-BY-4.0.
- Os modelos usam compressão Draco; o decodificador em `vendor/draco/` vem do
  [three.js](https://github.com/mrdoob/three.js) (Apache-2.0, Google Draco).

[m4-docs]: https://twgljs.org/docs/module-twgl_m4.html
[v3-docs]: https://twgljs.org/docs/module-twgl_v3.html
