/**
 * Team information shown on the Home page. Edit this file to update the team.
 * A member with a `photo` shows that photograph; otherwise (or if the image fails
 * to load) initials generated from the name are shown instead.
 */

/** A photograph in `public/images/team/` plus how to frame the face in the round avatar. */
export interface TeamPhoto {
  src: string;
  /** Point of the image (CSS position, e.g. "55% 31%") kept in view and zoomed around. */
  focus: string;
  /** Zoom factor applied around `focus` (1 = plain cover crop). */
  zoom: number;
}

export interface TeamMember {
  name: string;
  rollNumber: string;
  photo?: TeamPhoto;
}

/** Framing for the supplied photographs (presentation only; assignment is done in TEAM). */
export const TEAM_PHOTOS = {
  mohan: { src: "/images/team/Yashvanth.jpeg", focus: "48% 38%", zoom: 1.7 },
  mohan1: { src: "/images/team/mohan.jpeg", focus: "54% 36%", zoom: 2 },
  navesh: { src: "/images/team/navesh.jpeg", focus: "46% 37%", zoom: 2 },
} satisfies Record<string, TeamPhoto>;

export const TEAM: TeamMember[] = [
  { name: "Navesh K", rollNumber: "Roll No. 732924CSR106", photo: TEAM_PHOTOS.navesh },
  { name: "Mohanapriyan B", rollNumber: "Roll No. 732924CSR098", photo: TEAM_PHOTOS.mohan1 },
  { name: "Yashvanth L K", rollNumber: "Roll No. 732924CSL006", photo: TEAM_PHOTOS.mohan },
];
