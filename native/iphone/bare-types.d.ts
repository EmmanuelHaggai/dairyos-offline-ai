declare module 'bare-performance' {
  const performance: { now(): number; timeOrigin: number };
  export default performance;
}
