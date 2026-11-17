// Locker: avatar customization with live 3D preview on the turntable.
import { useState, useEffect } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Panel, Btn, Tabs, ColorRow, Rarity, Credits, Icon } from '../components.jsx';
import { ItemThumb } from './shop.jsx';
import { itemsByCat, priceFor } from '../../../../shared/items.js';
import { SKIN_TONES, COLOR_SWATCHES, AVATAR_SLOTS, SLOT_CATEGORY } from '../../../../shared/avatar.js';

const TABS = [
  { id: 'outfit', label: 'OUTFITS' }, { id: 'head', label: 'HEADS' }, { id: 'face', label: 'FACES' }, { id: 'hair', label: 'HAIR' },
  { id: 'hat', label: 'HATS' }, { id: 'faceAcc', label: 'FACE GEAR' }, { id: 'shirt', label: 'TOPS' }, { id: 'pants', label: 'BOTTOMS' },
  { id: 'back', label: 'BACK' }, { id: 'colors', label: 'COLORS' },
];

export function LockerPanel() {
  const p = S.profile.value;
  const [tab, setTab] = useState('outfit');
  const [draft, setDraft] = useState({ ...p.avatar });
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { app.previewAvatar(draft); }, [draft]);
  useEffect(() => () => app.previewAvatar(S.profile.value.avatar), []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(p.avatar);
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const items = tab !== 'colors' ? itemsByCat(SLOT_CATEGORY[tab]) : [];
  const save = () => net.send({ t: 'avatar.set', avatar: draft });
  const randomize = () => {
    const pick = (cat) => { const own = itemsByCat(cat).filter((i) => p.inventory.includes(i.id)); return own[Math.floor(Math.random() * own.length)].id; };
    const rc = (a) => a[Math.floor(Math.random() * a.length)];
    const next = { ...draft };
    for (const slot of AVATAR_SLOTS) next[slot] = pick(SLOT_CATEGORY[slot]);
    if (Math.random() < 0.7) next.outfit = 'outfit_none';
    next.skinTone = rc(SKIN_TONES.slice(0, 9)); next.hairColor = rc(COLOR_SWATCHES); next.shirtColor = rc(COLOR_SWATCHES);
    next.pantsColor = rc(COLOR_SWATCHES); next.accentColor = rc(COLOR_SWATCHES);
    setDraft(next);
  };
  return (
    <Panel title="LOCKER" sub="CUSTOMIZE YOUR OPERATOR · DRAG TO ROTATE" onClose={() => app.closePanel()} wide>
      <Tabs tabs={TABS} value={tab} onChange={setTab} small />
      {tab === 'colors' ? (
        <div class="colors-tab">
          <ColorRow label="SKIN" value={draft.skinTone} swatches={SKIN_TONES} onChange={(v) => set('skinTone', v)} />
          <ColorRow label="HAIR" value={draft.hairColor} swatches={COLOR_SWATCHES} onChange={(v) => set('hairColor', v)} />
          <ColorRow label="TOP" value={draft.shirtColor} swatches={COLOR_SWATCHES} onChange={(v) => set('shirtColor', v)} />
          <ColorRow label="BOTTOMS" value={draft.pantsColor} swatches={COLOR_SWATCHES} onChange={(v) => set('pantsColor', v)} />
          <ColorRow label="ACCENT" value={draft.accentColor} swatches={COLOR_SWATCHES} onChange={(v) => set('accentColor', v)} />
          <p class="muted small">Outfits override top/bottom colors. Accent colors tint hats, trims, visors and glow details.</p>
        </div>
      ) : (
        <div class="item-grid">
          {items.map((it) => {
            const owned = p.inventory.includes(it.id);
            const active = draft[tab] === it.id;
            return (
              <button key={it.id} class={`item-card rar-${it.rarity} ${active ? 'active' : ''} ${owned ? '' : 'locked'}`}
                onClick={() => (owned ? set(tab, it.id) : setConfirm(it))} onMouseEnter={() => !owned && app.previewAvatar({ ...draft, [tab]: it.id })} onMouseLeave={() => app.previewAvatar(draft)}>
                <ItemThumb id={it.id} />
                <div class="ic-name">{it.name}</div>
                {owned ? (active ? <span class="ic-tag">EQUIPPED</span> : null) : <span class="ic-price"><Icon name="lock" size={11} />{priceFor(it, p.day).toLocaleString()}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div class="locker-actions">
        <Btn variant="ghost" icon="refresh" onClick={randomize}>RANDOMIZE</Btn>
        <Btn variant="ghost" disabled={!dirty} onClick={() => setDraft({ ...p.avatar })}>REVERT</Btn>
        <Btn icon="check" disabled={!dirty} onClick={save}>{dirty ? 'SAVE LOOK' : 'SAVED'}</Btn>
      </div>
      {confirm && (
        <div class="confirm">
          <div class="confirm-card">
            <ItemThumb id={confirm.id} big />
            <div><Rarity r={confirm.rarity} /><h3>{confirm.name}</h3><Credits value={priceFor(confirm, p.day)} size="lg" /></div>
            <div class="confirm-actions">
              <Btn variant="ghost" onClick={() => setConfirm(null)}>CANCEL</Btn>
              <Btn icon="cart" disabled={p.credits < priceFor(confirm, p.day)} onClick={() => { net.send({ t: 'shop.buy', item: confirm.id }); set(tab, confirm.id); setConfirm(null); }}>BUY & WEAR</Btn>
            </div>
            {p.credits < priceFor(confirm, p.day) && <div class="muted small">Not enough credits — play matches and complete missions to earn more.</div>}
          </div>
        </div>
      )}
    </Panel>
  );
}
