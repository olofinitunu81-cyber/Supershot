// Armory: loadout selection, weapon stats, camos, purchase + 3D pedestal preview.
import { useState, useEffect } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Panel, Btn, Tabs, StatBar, Rarity, Credits, Icon } from '../components.jsx';
import { WEAPON_LIST, WEAPONS, statBars, CLASS_NAMES, fireInterval } from '../../../../shared/weapons.js';
import { itemsByCat, priceFor, ITEMS } from '../../../../shared/items.js';

const SLOTS = [
  { id: 'primary', label: 'PRIMARY', icon: 'gun' },
  { id: 'secondary', label: 'SECONDARY', icon: 'bolt' },
  { id: 'melee', label: 'MELEE', icon: 'skull' },
];

export function WeaponDetail({ def, onBuy, compact }) {
  const p = S.profile.value;
  const owned = p.inventory.includes(def.id);
  const equipped = p.loadout[def.slot] === def.id;
  const bars = statBars(def);
  const camoItems = itemsByCat('camo');
  const curCamo = p.camos[def.id] || 'camo_none';
  const [camo, setCamo] = useState(curCamo);
  useEffect(() => setCamo(p.camos[def.id] || 'camo_none'), [def.id]);
  useEffect(() => app.previewWeapon(def.id, camo), [def.id, camo]);
  const price = priceFor(ITEMS[def.id], p.day);
  const isGun = def.kind === 'gun';
  return (
    <div class="weapon-detail">
      <div class="wd-head">
        <div>
          <div class="wd-class">{CLASS_NAMES[def.cls]} · <Rarity r={def.rarity} /></div>
          <h3 class="wd-name">{def.name}</h3>
        </div>
        {equipped && <span class="tag equipped"><Icon name="check" size={12} />EQUIPPED</span>}
      </div>
      <p class="wd-desc">{def.desc}</p>
      <div class="wd-bars">
        {isGun ? (
          <>
            <StatBar label="DAMAGE" value={bars.damage} />
            <StatBar label="FIRE RATE" value={bars.fireRate} />
            <StatBar label="RANGE" value={bars.range} />
            <StatBar label="ACCURACY" value={bars.accuracy} />
            <StatBar label="CONTROL" value={bars.control} />
            <StatBar label="MOBILITY" value={bars.mobility} />
          </>
        ) : (
          <>
            <StatBar label="DAMAGE" value={bars.damage} />
            <StatBar label="SPEED" value={bars.speed} />
            <StatBar label="REACH" value={bars.range} />
            <StatBar label="MOBILITY" value={bars.mobility} />
          </>
        )}
      </div>
      {!compact && (
        <div class="wd-nums">
          {isGun ? (
            <>
              <div><span>DAMAGE</span><b>{def.projectile ? def.projectile.explode.damage : def.pellets > 1 ? `${def.damage}×${def.pellets}` : def.damage}</b></div>
              <div><span>HEADSHOT</span><b>×{def.headMul}</b></div>
              <div><span>RPM</span><b>{def.fire === 'burst' ? `${def.burst}-BURST` : def.rpm}</b></div>
              <div><span>MAGAZINE</span><b>{def.mag}</b></div>
              <div><span>RELOAD</span><b>{def.shell ? `${def.shell.each}s/SHELL` : `${def.reload}s`}</b></div>
              <div><span>MODE</span><b>{def.fire.toUpperCase()}</b></div>
            </>
          ) : (
            <>
              <div><span>DAMAGE</span><b>{def.damage}</b></div>
              <div><span>BACKSTAB</span><b>{def.backstab > 1 ? `×${def.backstab}` : '—'}</b></div>
              <div><span>SWING</span><b>{def.swing}s</b></div>
              <div><span>REACH</span><b>{def.range}m</b></div>
              <div><span>LUNGE</span><b>{def.lunge ? `${def.lunge}m/s` : '—'}</b></div>
              <div><span>MOVE</span><b>×{def.moveMul}</b></div>
            </>
          )}
        </div>
      )}
      <div class="wd-camos">
        <div class="sec-title">CAMOS</div>
        <div class="camo-grid">
          {camoItems.map((c) => {
            const has = p.inventory.includes(c.id);
            return (
              <button key={c.id} class={`camo-chip ${camo === c.id ? 'active' : ''} ${has ? '' : 'locked'}`} title={c.name} onClick={() => setCamo(c.id)}
                style={{ background: c.data.base ? `linear-gradient(135deg, ${c.data.base}, ${c.data.b})` : 'linear-gradient(135deg,#2a2d35,#4a505c)' }}>
                {!has && <Icon name="lock" size={12} />}
              </button>
            );
          })}
        </div>
        <div class="camo-name">{ITEMS[camo].name} {!p.inventory.includes(camo) && <span class="muted">· {priceFor(ITEMS[camo], p.day)} CR in SHOP</span>}</div>
      </div>
      <div class="wd-actions">
        {!owned ? (
          <Btn icon="cart" disabled={p.credits < price} onClick={() => onBuy(def.id)}>BUY · {price.toLocaleString()} CR</Btn>
        ) : equipped ? (
          <Btn variant="ghost" disabled>EQUIPPED</Btn>
        ) : (
          <Btn icon="check" onClick={() => net.send({ t: 'loadout.set', loadout: { [def.slot]: def.id } })}>EQUIP</Btn>
        )}
        {owned && camo !== curCamo && p.inventory.includes(camo) && (
          <Btn variant="secondary" onClick={() => net.send({ t: 'camo.set', weapon: def.id, camo })}>APPLY CAMO</Btn>
        )}
        {!owned && p.credits < price && <span class="muted small">Need {(price - p.credits).toLocaleString()} more credits</span>}
      </div>
    </div>
  );
}

export function ArmoryPanel() {
  const p = S.profile.value;
  const [slot, setSlot] = useState('primary');
  const [sel, setSel] = useState(p.loadout.primary);
  const list = WEAPON_LIST.filter((w) => w.slot === slot);
  useEffect(() => { setSel(p.loadout[slot]); }, [slot]);
  const def = WEAPONS[sel] || list[0];
  const buy = (id) => net.send({ t: 'shop.buy', item: id });
  return (
    <Panel title="ARMORY" sub="BUILD YOUR LOADOUT" onClose={() => app.closePanel()} wide>
      <div class="loadout-strip">
        {SLOTS.map((s) => {
          const w = WEAPONS[p.loadout[s.id]];
          return (
            <button key={s.id} class={`lo-slot ${slot === s.id ? 'active' : ''}`} onClick={() => setSlot(s.id)}>
              <span class="lo-label">{s.label}</span><b>{w.name}</b><small>{CLASS_NAMES[w.cls]}</small>
            </button>
          );
        })}
      </div>
      <div class="armory-grid">
        <div class="weapon-list">
          {list.map((w) => {
            const owned = p.inventory.includes(w.id);
            const eq = p.loadout[w.slot] === w.id;
            return (
              <button key={w.id} class={`weapon-row ${sel === w.id ? 'active' : ''} ${owned ? '' : 'locked'} rar-${w.rarity}`} onClick={() => setSel(w.id)}>
                <div class="wr-main"><b>{w.name}</b><small>{CLASS_NAMES[w.cls]}</small></div>
                <div class="wr-side">
                  {eq ? <span class="tag equipped">EQUIPPED</span> : owned ? <span class="tag owned">OWNED</span> : <Credits value={priceFor(ITEMS[w.id], p.day)} />}
                </div>
              </button>
            );
          })}
        </div>
        <WeaponDetail def={def} onBuy={buy} />
      </div>
    </Panel>
  );
}

export { fireInterval };
