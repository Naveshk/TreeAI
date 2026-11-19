import { useState } from "react";

import type { TeamMember } from "../../config/team";
import { initials } from "../../lib/misc";

/** Round team photo (object-fit: cover, zoomed around the face) with an initials fallback. */
export function TeamAvatar({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  const photo = member.photo;
  const frame = "mx-auto block size-28 overflow-hidden rounded-full ring-1 ring-teal-400/30 sm:size-32";

  if (!photo || failed) {
    return (
      <span
        aria-hidden="true"
        className={`${frame} flex items-center justify-center bg-teal-400/15 text-2xl font-semibold text-teal-200`}
      >
        {initials(member.name)}
      </span>
    );
  }

  return (
    <span className={`${frame} bg-navy-700`}>
      <img
        src={photo.src}
        alt={`Photo of ${member.name}`}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full object-cover text-transparent"
        style={{
          objectPosition: photo.focus,
          transform: `scale(${photo.zoom})`,
          transformOrigin: photo.focus,
        }}
      />
    </span>
  );
}
