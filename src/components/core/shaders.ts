// GLSL helpers for the NONO core.
export const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`

export const particleVertex = /* glsl */ `
uniform float uTime; uniform float uEnergy; uniform float uSize; uniform float uPixelRatio;
attribute float aRand;
varying float vAlpha; varying float vRand;
${SIMPLEX}
void main(){
  vec3 p = position;
  float n = snoise(p * 1.25 + vec3(uTime * 0.22, uTime * 0.17, -uTime * 0.2));
  float pulse = sin(uTime * 7.0 + aRand * 6.2831) * 0.5 + 0.5;
  float disp = 1.0 + n * (0.06 + uEnergy * 0.22) + uEnergy * 0.08 * pulse;
  p *= disp;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * (0.55 + aRand * 0.9) * (1.0 + uEnergy * 0.8) / -mv.z;
  vAlpha = 0.25 + 0.75 * smoothstep(-0.35, 0.7, n);
  vRand = aRand;
}`

export const particleFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime;
varying float vAlpha; varying float vRand;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + vRand * 40.0);
  vec3 col = mix(uColor, vec3(1.0), core * core * 0.6);
  gl_FragColor = vec4(col * 1.5, core * vAlpha * twinkle);
}`

export const fresnelVertex = /* glsl */ `
varying vec3 vNormal; varying vec3 vView;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

export const fresnelFragment = /* glsl */ `
uniform vec3 uColor; uniform float uEnergy; uniform float uPower; uniform float uFill;
varying vec3 vNormal; varying vec3 vView;
void main(){
  float f = pow(1.0 - abs(dot(vNormal, vView)), uPower);
  float a = f * (0.85 + uEnergy) + uFill;
  gl_FragColor = vec4(uColor * (1.2 + uEnergy), a);
}`

export const beamVertex = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

export const beamFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uEnergy;
varying vec2 vUv;
void main(){
  float fade = pow(1.0 - vUv.y, 1.6);
  float stripes = 0.65 + 0.35 * sin(vUv.x * 120.0 + uTime * 2.0) * sin(vUv.y * 30.0 - uTime * 4.0);
  gl_FragColor = vec4(uColor, fade * stripes * (0.16 + uEnergy * 0.25));
}`

export const discFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uEnergy;
varying vec2 vUv;
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float glow = smoothstep(1.0, 0.0, r);
  float rings = smoothstep(0.92, 1.0, sin(r * 42.0 - uTime * 2.5) * 0.5 + 0.5);
  float ang = atan(c.y, c.x);
  float spokes = smoothstep(0.96, 1.0, sin(ang * 36.0 + uTime * 0.6) * 0.5 + 0.5) * step(0.55, r) * step(r, 0.95);
  float a = glow * glow * (0.35 + uEnergy * 0.5) + rings * glow * 0.35 + spokes * 0.35;
  gl_FragColor = vec4(uColor * 1.4, a);
}`

export const streakFragment = /* glsl */ `
uniform vec3 uColor; uniform float uTime; uniform float uEnergy;
varying vec2 vUv;
void main(){
  float y = abs(vUv.y - 0.5) * 2.0;
  float core = exp(-y * 18.0);
  float halo = exp(-y * 5.0) * 0.35;
  float along = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.45, vUv.x);
  float flicker = 0.75 + 0.25 * sin(uTime * 23.0 + vUv.x * 9.0);
  gl_FragColor = vec4(uColor * 1.6, (core + halo) * along * flicker * (0.35 + uEnergy * 0.9));
}`
