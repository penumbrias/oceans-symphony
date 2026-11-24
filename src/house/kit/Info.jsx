// The kit's Info (new house step 1.3): the read view of one record, built
// from form rows, so editing a record looks like its Info (building code
// §1, plan §4).
//
//   <Info title={formatAlter(alter)} kind={terms.Alter} lead={<AlterChip alter={alter} size="lg" />}
//     menu={[…, { id: "del", label: `Delete ${name}`, danger: true, onSelect: askDelete }]}
//     sections={[
//       { title: "About", rows: [
//         { id: "pronouns", label: "Pronouns", value: alter.pronouns, empty: "Not set yet", onEdit },
//         { id: "added", label: "Added", value: added, lockedReason: "Set when it was made" },
//       ] },
//     ]} />
//
// States: `loading` draws placeholders the size of the rows to come;
// `error` says what failed, that the data is safe, and offers Try again;
// no record (`empty`) says what goes here and the one next step.
// Info never writes: `onEdit` opens the row's editor, whose Save is the
// record's own write path. Delete lives only in ⋯ (building code §1).

import React, { useId } from "react";
import Menu from "@/house/kit/Menu";
import { Form, FormRow } from "@/house/kit/FormRow";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/house/kit/States";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

export default function Info({ title, kind, lead, menu, sections = [], loading = false, error, onRetry, empty, editing, renderEditor }) {
  const id = useId();
  if (loading) return <LoadingBlock label={kind ? `Loading the ${String(kind).toLowerCase()}` : "Loading"} rows={4} kind="rows" />;
  if (error) return <ErrorBlock what={error} onRetry={onRetry} />;
  if (!title && empty) return <EmptyBlock {...empty} />;
  return (
    <article className="hk-info" aria-labelledby={`${id}-t`}>
      <header className="hk-info-head">
        {lead ? <div className="hk-info-lead">{lead}</div> : null}
        <div className="hk-info-titles">
          <h2 id={`${id}-t`} className="hk-info-title house-label">{title}</h2>
          {kind ? <p className="hk-info-kind">{kind}</p> : null}
        </div>
        {menu?.length ? <Menu label={`More for ${typeof title === "string" ? title : "this"}`} items={menu} /> : null}
      </header>
      {sections.map((s, i) => (
        <section key={s.id || i} className="hk-info-section" aria-labelledby={`${id}-s${i}`}>
          <h3 id={`${id}-s${i}`} className="hk-info-section-title house-label">{s.title}</h3>
          <Form label={s.title}>
            {s.rows.map((r) => (
              <FormRow key={r.id || r.label} label={r.label} value={r.value} empty={r.empty}
                onEdit={r.onEdit} lockedReason={r.lockedReason}
                editing={editing === r.id} onSave={r.onSave} onCancel={r.onCancel} saving={r.saving}
                saveDisabledReason={r.saveDisabledReason}>
                {editing === r.id && renderEditor ? renderEditor(r) : null}
              </FormRow>
            ))}
          </Form>
        </section>
      ))}
    </article>
  );
}

export { Info };
