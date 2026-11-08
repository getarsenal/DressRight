import type { Build } from '../../regs/build';
import { InsigniaEditor } from '../InsigniaEditor';

export function UnitScreen({ build, update }: { build: Build; update: (p: Partial<Build>) => void }) {
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Unit insignia</h1>
      </header>
      <p className="muted pad">Upload your unit's real crest and patches (they stay on your device), or design a stand-in.</p>

      <InsigniaEditor
        label="Distinctive unit insignia (crest)"
        hint="Worn on both shoulder loops."
        value={build.dui}
        onChange={(dui) => update({ dui })}
      />
      <InsigniaEditor
        label="Shoulder sleeve insignia (current unit)"
        hint="Left sleeve: the unit you are assigned to now."
        value={build.ssi}
        onChange={(ssi) => update({ ssi })}
      />

      <div className="card toggles">
        <label className="toggle">
          <input type="checkbox" checked={build.airborneTab} onChange={(e) => update({ airborneTab: e.target.checked })} />
          <span>My unit's patch has an Airborne tab</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={build.hasCombatPatch} onChange={(e) => update({ hasCombatPatch: e.target.checked })} />
          <span>I have a combat patch (SSI-MOHC, formerly SSI-FWTS)</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={build.rdi} onChange={(e) => update({ rdi: e.target.checked })} />
          <span>I wear a regimental distinctive insignia</span>
        </label>
      </div>

      {build.hasCombatPatch && (
        <InsigniaEditor
          label="SSI-MOHC (combat patch)"
          hint="Right sleeve: the unit you served with in a qualifying hostile area."
          value={build.combatPatch}
          onChange={(combatPatch) => update({ combatPatch })}
        />
      )}
    </div>
  );
}
