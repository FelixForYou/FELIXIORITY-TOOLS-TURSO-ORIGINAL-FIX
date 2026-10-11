import { nodeSchema, type Session } from "../model";
import { allPages } from "./transport";
export const nodes = { all: (s: Session) => allPages(s, "nodes", nodeSchema) };
