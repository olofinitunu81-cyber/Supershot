export function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => fn(...args, (e, v) => (e ? reject(e) : resolve(v))));
}
export default { promisify };
