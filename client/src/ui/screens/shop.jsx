// Shop (featured rotation, categories, purchase) and Inventory (owned items, equip).
import { useState, useEffect } from 'preact/hooks';
import { S } from '../../state.js';
import { app } from '../../app.js';
import { net } from '../../net.js';
import { Panel, Btn, Tabs, Rarity, Credits, Icon, Countdown, nextUtcMidnight, Empty } from '../components.jsx';
import { thumb, cachedThumb } from '../thumbs.js';
import { ALL_ITEMS, ITEMS, itemsByCat, priceFor, featuredForDay, FEATURED_DISCOUNT } from '../../../../shared/items.js';
import { WEAPONS, CLASS_NAMES } from '../../../../shared/weapons.js';
import { SLOT_CATEGORY } from '../../../../shared/avatar.js';
import { WeaponDetail } from './armory.jsx';

const CAT_SLOT = Object.fromEntries(Object.entries(SLOT_CATEGORY).map(([slot, cat]) => [cat, slot]));

export function ItemThumb({ id, big }) {
  const [url, setUrl] = useState(cachedThumb(id) || '');
  useEffect(() => {
    let live = true;
    if (!cachedThumb(id)) thumb(id).then((u) => live && setUrl(u));
    else setUrl(cachedThumb(id));
    return () => { live = false; };
  }, [id]);
  return <div class={`thumb ${big ? 'big' : ''}`}>{url ? <img src={url} alt="" draggable={false} /> : <div class="thumb-load" />}</div>;
}

const SHOP_TABS = [
  { id: 'featured', label: 'FEATURED', icon: 'star' }, { id: 'weapon', label: 'WEAPONS' }, { id: 'melee', label: 'MELEE' },
  { id: 'camo', label: 'CAMOS' }, { id: 'outfit', label: 'OUTFITS' }, { id: 'hat', label: 'HATS' }, { id: 'hair', label: 'HAIR' },
  { id: 'face', label: 'FACES' }, { id: 'faceacc', label: 'FACE GEAR' }, { id: 'shirt', label: 'TOPS' }, { id: 'pants', label: 'BOTTOMS' },
  { id: 'back', label: 'BACK' }, { id: 'head', label: 'HEADS' }, { id: 'emote', label: 'EMOTES' },
];

function preview(item) {
  const p = S.profile.value;
  if (!item) return;
  if (item.cat === 'weapon' || item.cat === 'melee') { app.focus('armory'); app.previewWeapon(item.id, null); }
  else if (item.cat === 'camo') { app.focus('armory'); app.previewWeapon(p.loadout.primary, item.id); }
  else if (CAT_SLOT[item.cat]) { app.focus('locker'); app.previewAvatar({ ...p.avatar, [CAT_SLOT[item.cat]]: item.id }); }
  else if (item.cat === 'emote') { app.focus('locker'); app.previewAvatar(p.avatar); if (app.lobby) app.lobby.showcase.playEmote(item.id); }
}

function ItemCard({ it, onClick, active }) {
  const p = S.profile.value;
  const owned = p.inventory.includes(it.id);
  const price = priceFor(it, p.day);
  const disc = price < it.price;
  return (
    <button class={`item-card rar-${it.rarity} ${active ? 'active' : ''} ${owned ? 'owned' : ''}`} onClick={onClick}>
      <ItemThumb id={it.id} />
      <div class="ic-name">{it.name}</div>
      {owned ? <span class="ic-tag owned"><Icon name="check" size={11} />OWNED</span> : (
        <span class="ic-price">{disc && <s>{it.price.toLocaleString()}</s>}<Icon name="credits" size={12} />{price.toLocaleString()}</span>
      )}
      {disc && !owned && <span class="ic-sale">-{Math.round(FEATURED_DISCOUNT * 100)}%</span>}
    </button>
  );
}

export function ShopPanel() {
  const p = S.profile.value;
  const [tab, setTab] = useState('featured');
  const [sel, setSel] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { preview(sel); }, [sel && sel.id]);
  const list = tab === 'featured' ? featuredForDay(p.day).map((id) => ITEMS[id]) : ALL_ITEMS.filter((i) => i.cat === tab && i.price > 0);
  const owned = sel && p.inventory.includes(sel.id);
  const price = sel ? priceFor(sel, p.day) : 0;
  const buy = () => { net.send({ t: 'shop.buy', item: sel.id }); setConfirm(false); };
  return (
    <Panel title="SHOP" sub={<span>DEALS RESET IN <Countdown to={nextUtcMidnight()} /></span>} onClose={() => app.closePanel()} wide>
      <Tabs tabs={SHOP_TABS} value={tab} onChange={(t) => { setTab(t); setSel(null); }} small />
      <div class="shop-grid">
        <div class="item-grid">
          {list.map((it) => <ItemCard key={it.id} it={it} active={sel && sel.id === it.id} onClick={() => setSel(it)} />)}
        </div>
        <div class="shop-detail">
          {!sel ? (
            <div class="shop-hint">
              <Icon name="cart" size={40} />
              <p>Select an item to preview it in 3D.</p>
              <div class="bal">BALANCE <Credits value={p.credits} size="lg" /></div>
              <p class="muted small">Earn credits by playing matches, claiming daily rewards and completing missions.</p>
            </div>
          ) : WEAPONS[sel.id] ? (
            <WeaponDetail def={WEAPONS[sel.id]} onBuy={() => setConfirm(true)} />
          ) : (
            <div class="cos-detail">
              <ItemThumb id={sel.id} big />
              <Rarity r={sel.rarity} />
              <h3>{sel.name}</h3>
              <div class="muted">{SHOP_TABS.find((t) => t.id === sel.cat)?.label}</div>
              {owned ? <Btn variant="ghost" disabled>OWNED</Btn> : <Btn icon="cart" disabled={p.credits < price} onClick={() => setConfirm(true)}>BUY · {price.toLocaleString()} CR</Btn>}
              {!owned && p.credits < price && <div class="muted small">Need {(price - p.credits).toLocaleString()} more credits.</div>}
              {owned && CAT_SLOT[sel.cat] && <Btn variant="secondary" onClick={() => net.send({ t: 'avatar.set', avatar: { ...p.avatar, [CAT_SLOT[sel.cat]]: sel.id } })}>EQUIP NOW</Btn>}
            </div>
          )}
        </div>
      </div>
      {confirm && sel && (
        <div class="confirm">
          <div class="confirm-card">
            <ItemThumb id={sel.id} big />
            <div><Rarity r={sel.rarity} /><h3>{sel.name}</h3></div>
            <div class="confirm-price"><span>PRICE</span><Credits value={price} size="lg" /></div>
            <div class="confirm-price"><span>BALANCE AFTER</span><Credits value={p.credits - price} /></div>
            <div class="confirm-actions">
              <Btn variant="ghost" onClick={() => setConfirm(false)}>CANCEL</Btn>
              <Btn icon="check" disabled={p.credits < price} onClick={buy}>CONFIRM</Btn>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

const INV_TABS = [
  { id: 'weapon', label: 'WEAPONS' }, { id: 'melee', label: 'MELEE' }, { id: 'camo', label: 'CAMOS' }, { id: 'outfit', label: 'OUTFITS' },
  { id: 'hat', label: 'HATS' }, { id: 'hair', label: 'HAIR' }, { id: 'face', label: 'FACES' }, { id: 'faceacc', label: 'FACE GEAR' },
  { id: 'shirt', label: 'TOPS' }, { id: 'pants', label: 'BOTTOMS' }, { id: 'back', label: 'BACK' }, { id: 'head', label: 'HEADS' }, { id: 'emote', label: 'EMOTES' },
];

export function InventoryPanel() {
  const p = S.profile.value;
  const [tab, setTab] = useState('weapon');
  const all = itemsByCat(tab);
  const owned = all.filter((i) => p.inventory.includes(i.id));
  const total = ALL_ITEMS.length, have = ALL_ITEMS.filter((i) => p.inventory.includes(i.id)).length;
  const equip = (it) => {
    if (it.cat === 'weapon' || it.cat === 'melee') { const d = WEAPONS[it.id]; net.send({ t: 'loadout.set', loadout: { [d.slot]: it.id } }); }
    else if (CAT_SLOT[it.cat]) net.send({ t: 'avatar.set', avatar: { ...p.avatar, [CAT_SLOT[it.cat]]: it.id } });
    else if (it.cat === 'emote') { if (app.lobby) app.lobby.showcase.playEmote(it.id); net.send({ t: 'lobby.emote', id: it.id }); }
    else if (it.cat === 'camo') app.openPanel('armory');
  };
  const isEquipped = (it) => {
    if (it.cat === 'weapon' || it.cat === 'melee') return Object.values(p.loadout).includes(it.id);
    if (CAT_SLOT[it.cat]) return p.avatar[CAT_SLOT[it.cat]] === it.id;
    if (it.cat === 'camo') return Object.values(p.camos).includes(it.id);
    return false;
  };
  return (
    <Panel title="INVENTORY" sub={`${have} / ${total} ITEMS COLLECTED`} onClose={() => app.closePanel()} wide>
      <Tabs tabs={INV_TABS.map((t) => ({ ...t, badge: `${itemsByCat(t.id).filter((i) => p.inventory.includes(i.id)).length}` }))} value={tab} onChange={setTab} small />
      <div class="inv-progress"><div><i style={{ width: `${(owned.length / all.length) * 100}%` }} /></div><span>{owned.length}/{all.length}</span></div>
      {owned.length === 0 ? <Empty text="Nothing here yet — visit the shop!" /> : (
        <div class="item-grid inv">
          {owned.map((it) => {
            const eq = isEquipped(it);
            const d = WEAPONS[it.id];
            return (
              <div key={it.id} class={`item-card rar-${it.rarity} ${eq ? 'active' : ''}`} onMouseEnter={() => preview(it)}>
                <ItemThumb id={it.id} />
                <div class="ic-name">{it.name}</div>
                {d && <div class="ic-sub">{CLASS_NAMES[d.cls]}</div>}
                {eq ? <span class="ic-tag">{it.cat === 'camo' ? 'APPLIED' : 'EQUIPPED'}</span> : (
                  <button class="ic-btn" onClick={() => equip(it)}>{it.cat === 'emote' ? 'PLAY' : it.cat === 'camo' ? 'APPLY IN ARMORY' : 'EQUIP'}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div class="inv-foot"><Btn variant="secondary" icon="cart" onClick={() => app.openPanel('shop')}>GO TO SHOP</Btn></div>
    </Panel>
  );
}
