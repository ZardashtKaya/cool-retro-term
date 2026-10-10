#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform ubuf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    float vhsStrength;
};

layout(binding = 1) uniform sampler2D source;
layout(binding = 2) uniform sampler2D noiseSource;

// YIQ / RGB conversion
vec3 rgb2yiq(vec3 c) {
    return vec3(
        (0.2989 * c.x + 0.5959 * c.y + 0.2115 * c.z),
        (0.5870 * c.x - 0.2744 * c.y - 0.5229 * c.z),
        (0.1140 * c.x - 0.3216 * c.y + 0.3114 * c.z)
    );
}

vec3 yiq2rgb(vec3 c) {
    return vec3(
        (1.0 * c.x + 1.0 * c.y + 1.0 * c.z),
        (0.956 * c.x - 0.2720 * c.y - 1.1060 * c.z),
        (0.6210 * c.x - 0.6474 * c.y + 1.7046 * c.z)
    );
}

vec2 Circle(float Start, float Points, float Point) {
    float Rad = (3.14159265359 * 2.0 * (1.0 / Points)) * (Point + Start);
    return vec2(-(.3 + Rad), cos(Rad));
}

vec3 Blur(vec2 uv, float f, float d) {
    float t = 0.0;
    vec2 PixelOffset = vec2(d + 0.0005 * t, 0.0);

    float Start = 2.0 / 14.0;
    vec2 Scale = 0.66 * 4.0 * 2.0 * PixelOffset.xy;

    vec3 N0  = texture(source, uv + Circle(Start, 14.0, 0.0) * Scale).rgb;
    vec3 N1  = texture(source, uv + Circle(Start, 14.0, 1.0) * Scale).rgb;
    vec3 N2  = texture(source, uv + Circle(Start, 14.0, 2.0) * Scale).rgb;
    vec3 N3  = texture(source, uv + Circle(Start, 14.0, 3.0) * Scale).rgb;
    vec3 N4  = texture(source, uv + Circle(Start, 14.0, 4.0) * Scale).rgb;
    vec3 N5  = texture(source, uv + Circle(Start, 14.0, 5.0) * Scale).rgb;
    vec3 N6  = texture(source, uv + Circle(Start, 14.0, 6.0) * Scale).rgb;
    vec3 N7  = texture(source, uv + Circle(Start, 14.0, 7.0) * Scale).rgb;
    vec3 N8  = texture(source, uv + Circle(Start, 14.0, 8.0) * Scale).rgb;
    vec3 N9  = texture(source, uv + Circle(Start, 14.0, 9.0) * Scale).rgb;
    vec3 N10 = texture(source, uv + Circle(Start, 14.0, 10.0) * Scale).rgb;
    vec3 N11 = texture(source, uv + Circle(Start, 14.0, 11.0) * Scale).rgb;
    vec3 N12 = texture(source, uv + Circle(Start, 14.0, 12.0) * Scale).rgb;
    vec3 N13 = texture(source, uv + Circle(Start, 14.0, 13.0) * Scale).rgb;
    vec3 N14 = texture(source, uv).rgb;

    float W = 1.0 / 15.0;

    vec3 clr =
        (N0 * W) +
        (N1 * W) +
        (N2 * W) +
        (N3 * W) +
        (N4 * W) +
        (N5 * W) +
        (N6 * W) +
        (N7 * W) +
        (N8 * W) +
        (N9 * W) +
        (N10 * W) +
        (N11 * W) +
        (N12 * W) +
        (N13 * W) +
        (N14 * W);

    return clr;
}

void main() {
    vec2 uv = qt_TexCoord0;
    vec3 origColor = texture(source, uv).rgb;

    if (vhsStrength <= 0.0) {
        fragColor = vec4(origColor, qt_Opacity);
        return;
    }

    // Dynamic noise samples using the built-in noise texture
    float s = texture(noiseSource, uv * 4.0 + vec2(fract(time * 0.17), fract(time * 0.23))).r;

    // VHS tracking bar distortion
    float e = min(0.30, pow(max(0.0, cos(uv.y * 4.0 - time * 0.8 + 0.3) - 0.75) * (s + 0.5), 3.0)) * 25.0;
    s -= pow(texture(noiseSource, vec2(0.01 + floor(uv.y * 32.0) / 32.0, fract(time * 0.1))).r, 1.0);
    uv.x += e * abs(s * 3.0) * vhsStrength;

    // Head-switching jitter at the bottom of the video frame
    float bottomDist = 1.0 - uv.y;
    float r = texture(noiseSource, vec2(fract(time * 1.5), 0.5)).r * (2.0 * s);
    uv.x += abs(r * pow(min(0.003, bottomDist - 0.15) * 6.0, 2.0)) * vhsStrength;

    float d = (0.051 + abs(sin(s / 4.0))) * vhsStrength;
    float c = max(0.0001, 0.002 * d);

    // Y (Luminance) blur
    vec3 sampleY = Blur(uv, 0.0, c + c * uv.x);
    float y = rgb2yiq(sampleY).r;

    // I (Chroma I) horizontal smear and shift
    uv.x += 0.01 * d;
    c *= 6.0;
    vec3 sampleI = Blur(uv, 0.333, c);
    float i = rgb2yiq(sampleI).g;

    // Q (Chroma Q) horizontal smear and shift
    uv.x += 0.005 * d;
    c *= 2.50;
    vec3 sampleQ = Blur(uv, 0.666, c);
    float q = rgb2yiq(sampleQ).b;

    // Reconstruct RGB and apply tracking line darkening
    vec3 vhsColor = yiq2rgb(vec3(y, i, q)) - vec3(pow(max(0.0, s + e * 2.0), 3.0) * vhsStrength);
    vhsColor *= smoothstep(1.0, 0.999, uv.x - 0.1);

    // Blend between original and VHS according to vhsStrength
    vec3 finalColor = mix(origColor, vhsColor, clamp(vhsStrength * 1.2, 0.0, 1.0));

    fragColor = vec4(finalColor, qt_Opacity);
}
