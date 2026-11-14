/**
 * Team information shown on the Home page. Edit this file to update the team;
 * initials are generated from the name automatically.
 */
export interface TeamMember {
  name: string;
  rollNumber: string;
  role: string;
}

export const TEAM: TeamMember[] = [
  { name: "Team Member One", rollNumber: "Roll No. 000001", role: "Machine Learning & Backend" },
  { name: "Team Member Two", rollNumber: "Roll No. 000002", role: "Frontend & Visualization" },
  { name: "Team Member Three", rollNumber: "Roll No. 000003", role: "UI/UX Design & Testing" },
];
