import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { personalAccessToken } from "./preferences";
import { Response } from "./types";
import { match, P } from "ts-pattern";

export default function Command() {
  const { data, isLoading } = useFetch<Response>("https://api.github.com/user/codespaces", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${personalAccessToken}` },
  });

  return (
    <List isLoading={isLoading}>
      {data?.codespaces
        .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime())
        .map((codespace) => (
          <List.Item
            key={codespace.id}
            icon={match(codespace.state)
              .with(P.union("Unknown"), () => Icon.QuestionMarkCircle)
              .with(
                P.union(
                  "Queued",
                  "Provisioning",
                  "Awaiting",
                  "Moved",
                  "ShuttingDown",
                  "Exporting",
                  "Updating",
                  "Rebuilding"
                ),
                () => Icon.Clock
              )
              .with(P.union("Available", "Created", "Starting", "Shutdown"), () => Icon.ComputerChip)
              .with(P.union("Unavailable", "Deleted", "Archived", "Failed"), () => Icon.XMarkCircle)
              .exhaustive()}
            title={codespace.display_name || codespace.name}
            subtitle={`${codespace.repository.owner.login}/${codespace.repository.name}`}
            accessories={[
              {
                date: new Date(codespace.last_used_at),
                tooltip: `Last used at: ${new Date(codespace.last_used_at).toLocaleString()}`,
              },
            ]}
            actions={<Actions codespace={codespace} />}
          />
        ))}
    </List>
  );
}

function Actions(props: { codespace: Response["codespaces"][0] }) {
  return (
    <ActionPanel>
      <Action.OpenInBrowser
        title="Open in VS Code"
        url={`vscode://github.codespaces/connect?name=${props.codespace.name}&windowId=_blank`}
      />
      <Action.OpenInBrowser title="Open on web" url={props.codespace.web_url} />
    </ActionPanel>
  );
}
