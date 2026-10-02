import { z } from "zod";
import { cardArtSchema } from "./schemas";
import { validateOrganizationTeams } from "@/lib/organization-team";
const id = z.string().min(1).max(80);
const node = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  parentId: id.optional(),
  requiredCourseIds: z.array(z.uuid()).max(1000).optional(),
  teamIds: z.array(id).max(1000).optional(),
  legacyDirectTeamIds: z.array(id).max(1000).optional(),
  teamLinkScope: z.enum(["direct", "subtree"]).optional(),
  learningItems: z
    .array(z.object({ kind: z.enum(["course", "curriculum"]), id }))
    .max(1000)
    .optional(),
});
export const governanceSchema = z
  .object({
    expected: z.number().int().positive(),
    curricula: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(80),
          description: z.string().max(1000),
          courseIds: z.array(z.uuid()).max(1000),
          status: z.enum(["draft", "published"]),
          cardArt: cardArtSchema.optional(),
        }),
      )
      .max(1000)
      .optional(),
    groups: z.array(node).max(1000),
    teams: z
      .array(
        node.extend({
          managerId: z.uuid().optional(),
          system: z.literal("organization").optional(),
        }),
      )
      .max(1000),
    users: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string().trim().min(1).max(80),
          email: z.email().max(254),
          role: z.enum(["admin", "manager", "learner", "contributor"]),
          active: z.boolean(),
          groups: z.array(id).max(100),
          teamId: id.optional(),
          onboardingStart: z.iso.date().optional(),
          hireDate: z.iso.date().optional(),
        }),
      )
      .max(10000),
  })
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    try {
      validateOrganizationTeams(
        value.teams,
        value.teams.find((team) => team.system === "organization")?.id,
      );
    } catch (error) {
      fail((error as Error).message);
    }
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
    const curricula = value.curricula || [];
    if (
      new Set(curricula.map((c) => c.id)).size !== curricula.length ||
      new Set(curricula.map((c) => c.name.toLowerCase())).size !==
        curricula.length
    )
      fail("Use unique curriculum IDs and names.");
    for (const c of curricula)
      if (
        new Set(c.courseIds).size !== c.courseIds.length ||
        (c.status === "published" && !c.courseIds.length)
      )
        fail("Published curricula need unique courses.");
    for (const g of [...value.groups, ...value.teams]) {
      if (value.groups.includes(g) && g.parentId)
        fail(
          "Learning groups are independent audiences and cannot have parents.",
        );
      if (value.groups.includes(g) && g.teamLinkScope === "direct")
        fail(
          "Legacy direct team links must be preserved separately. Reload before saving.",
        );
      if (
        [...(g.teamIds || []), ...(g.legacyDirectTeamIds || [])].some(
          (id) => !teams.has(id),
        ) ||
        new Set([...(g.teamIds || []), ...(g.legacyDirectTeamIds || [])])
          .size !==
          (g.teamIds?.length || 0) + (g.legacyDirectTeamIds?.length || 0)
      )
        fail("Invalid team link.");
      if (
        new Set(g.learningItems?.map((i) => i.kind + ":" + i.id)).size !==
        (g.learningItems?.length || 0)
      )
        fail("Duplicate learning item.");
      if (
        value.curricula &&
        g.learningItems?.some(
          (i) =>
            i.kind === "curriculum" &&
            !curricula.some((c) => c.id === i.id && c.status === "published"),
        )
      )
        fail("Choose a published curriculum.");
    }
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
  role: z.enum(["learner", "manager", "admin", "contributor"]),
  groups: z.array(id).max(100),
  teamId: id.optional(),
  onboardingStart: z.iso.date().optional(),
  hireDate: z.iso.date().optional(),
  revoke: z.boolean().optional(),
});
