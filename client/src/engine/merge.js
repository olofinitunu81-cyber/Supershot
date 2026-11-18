// Draw-call reduction for rigid models: merges the meshes under a node into one mesh per
// material, in that node's local space. Used on player models, whose many small parts
// (weapon, hair, hats, gear) otherwise cost one draw call each.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmp = new THREE.Matrix4();

function prepare(geo, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  g.applyMatrix4(matrix);
  return g;
}

/**
 * @param {THREE.Object3D} root node whose rigid descendants get merged
 * @param {{ exclude?: THREE.Object3D[] }} opts objects (and their subtrees) to leave alone,
 *   e.g. animated parts or meshes other code keeps references to
 */
export function mergeStatic(root, { exclude = [] } = {}) {
  const skip = new Set(exclude.filter(Boolean));
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const visit = (o) => {
    for (const c of o.children) {
      if (skip.has(c)) continue;
      if (c.isMesh && !c.isSkinnedMesh && !c.isInstancedMesh && !Array.isArray(c.material) && c.visible && c.children.length === 0) {
        let e = byMat.get(c.material);
        if (!e) byMat.set(c.material, (e = []));
        e.push(c);
      }
      visit(c);
    }
  };
  visit(root);
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const merged = mergeGeometries(meshes.map((m) => prepare(m.geometry, tmp.multiplyMatrices(inv, m.matrixWorld))), false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    mesh.renderOrder = meshes[0].renderOrder;
    for (const m of meshes) m.removeFromParent();
    root.add(mesh);
  }
}
