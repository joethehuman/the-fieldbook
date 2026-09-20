import { z } from "zod";
const id = z.string().min(1).max(80);
const node = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  parentId: id.optional(),
  requiredCourseIds: z.array(z.uuid()).max(1000).optional(),
});
export const governanceSchema = z
  .object({
    expected: z.number().int().positive(),
    groups: z.array(node).max(1000),
    teams: z.array(node.extend({ managerId: z.uuid().optional() })).max(1000),
    users: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string().trim().min(1).max(80),
          email: z.email().max(254),
          role: z.enum(["admin", "manager", "learner"]),
          active: z.boolean(),
          groups: z.array(id).max(100),
          teamId: id.optional(),
          onboardingStart: z.iso.date().optional(),
        }),
      )
      .max(10000),
  })
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    for (const nodes of [value.groups, value.teams]) {
      const map = new Map(nodes.map((n) => [n.id, n]));
      if (
        map.size !== nodes.length ||
        new Set(nodes.map((n) => n.name.toLowerCase())).size !== nodes.length
      )
        fail("Use unique IDs and names.");
      for (const node of nodes) {
        const visited = new Set<string>();
        let current: typeof node | undefined = node;
        while (current) {
          if (visited.has(current.id)) {
            fail("Hierarchy cannot contain a cycle.");
            break;
          }
          visited.add(current.id);
          if (current.parentId && !map.has(current.parentId)) {
            fail("Parent does not exist.");
            break;
          }
          current = current.parentId ? map.get(current.parentId) : undefined;
        }
      }
    }
    const groups = new Set(value.groups.map((g) => g.id)),
      teams = new Set(value.teams.map((t) => t.id));
    if (new Set(value.users.map((u) => u.id)).size !== value.users.length)
      fail("Duplicate user.");
    for (const u of value.users)
      if (
        new Set(u.groups).size !== u.groups.length ||
        u.groups.some((g) => !groups.has(g)) ||
        (u.teamId && !teams.has(u.teamId))
      )
        fail("Invalid membership.");
  });
export const pendingSchema = z.object({
  expected: z.number().int().positive(),
  email: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  name: z.string().trim().min(1).max(80),
  role: z.enum(["learner", "manager", "admin"]),
  groups: z.array(id).max(100),
  teamId: id.optional(),
  onboardingStart: z.iso.date().optional(),
  revoke: z.boolean().optional(),
});
