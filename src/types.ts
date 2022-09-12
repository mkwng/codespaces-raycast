import { Endpoints } from "@octokit/types";

export type Response = Endpoints["GET /user/codespaces"]["response"]["data"];
export type Codespace = Response["codespaces"][0];
