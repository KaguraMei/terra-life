declare module '*?legacy' {
  /** Build-time wrapper for an existing IIFE, with a private window.TL per runtime. */
  const initialize: (runtime: object) => void;
  export default initialize;
}
