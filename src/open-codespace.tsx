import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Form,
  Icon,
  List,
  showHUD,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { getAvatarIcon, useFetch } from "@raycast/utils";
import { personalAccessToken, preferredEditor } from "./preferences";
import { Codespace, Response } from "./types";
import { match, P } from "ts-pattern";
import { Endpoints } from "@octokit/types";
import fetch from "node-fetch";

export default function Command() {
  const { data, isLoading, revalidate } = useFetch<Response>("https://api.github.com/user/codespaces", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${personalAccessToken}` },
  });

  const handleRevalidate = revalidate;

  return (
    <List isLoading={isLoading}>
      {data?.codespaces
        .sort((a, b) => new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime())
        .map((codespace) => {
          const gitStatus = {
            icon: Icon.ArrowUp,
            text: `${codespace.git_status.ahead}${codespace.git_status.has_uncommitted_changes ? "+" : ""}`,
            tooltip: codespace.git_status.has_uncommitted_changes
              ? codespace.git_status.ahead
                ? `You have ${codespace.git_status.ahead} unpushed commits as well as other uncommitted changes`
                : `You have uncommitted changes`
              : codespace.git_status.has_unpushed_changes
              ? `You have ${codespace.git_status.ahead} unpushed commits`
              : undefined,
          };
          return (
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
                .with(P.union("Available", "Created", "Starting", "Shutdown"), () =>
                  getAvatarIcon(`${codespace.repository.name.toUpperCase()}`)
                )
                .with(P.union("Unavailable", "Deleted", "Archived", "Failed"), () => Icon.XMarkCircle)
                .exhaustive()}
              title={codespace.display_name || codespace.name}
              keywords={[
                `${codespace.repository.owner.login}/${codespace.repository.name}`,
                codespace.name,
                codespace.repository.name,
              ]}
              subtitle={`${codespace.repository.owner.login}/${codespace.repository.name}`}
              accessories={[
                gitStatus,
                {
                  icon: Icon.ComputerChip,
                  tooltip: codespace.machine?.display_name,
                  text: `${codespace.machine?.cpus}-core`,
                },
                {
                  date: new Date(codespace.last_used_at),
                  tooltip: `Last used at: ${new Date(codespace.last_used_at).toLocaleString()}`,
                },
              ]}
              actions={<Actions codespace={codespace} onRevalidate={handleRevalidate} />}
            />
          );
        })}
    </List>
  );
}

const OpenWebEditorAction = ({ codespace }: { codespace: Codespace }) => (
  <Action.OpenInBrowser title="Open on web" url={codespace.web_url} />
);
const OpenVSCodeAction = ({ codespace }: { codespace: Codespace }) => (
  <Action.OpenInBrowser
    icon={Icon.Code}
    title="Open in VS Code"
    url={`vscode://github.codespaces/connect?name=${codespace.name}&windowId=_blank`}
  />
);

const Rename = ({ codespace, onRevalidate }: { codespace: Codespace; onRevalidate: () => void }) => {
  const { pop } = useNavigation();
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename"
            onSubmit={async ({ name }) => {
              const toast = await showToast({
                title: `Renaming to ${name}...`,
                style: Toast.Style.Animated,
              });
              try {
                const response = await fetch(`${codespace.url}`, {
                  method: "PATCH",
                  headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${personalAccessToken}`,
                  },
                  body: JSON.stringify({
                    display_name: name,
                  }),
                });
                if (response.status !== 200) {
                  const data = (await response.json()) as { message: string; documentation_url: string };
                  toast.style = Toast.Style.Failure;
                  toast.title = data.message;
                  toast.primaryAction = {
                    title: "Copy link to docs",
                    onAction: () => {
                      Clipboard.copy(data.documentation_url);
                    },
                  };
                } else {
                  await toast.hide();
                  await showHUD("Name successfully changed");
                  pop();
                  onRevalidate();
                }
              } catch (error) {
                console.log(error);
                toast.style = Toast.Style.Failure;
                toast.title = "Failed to change name";
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        defaultValue={codespace.display_name || ""}
        placeholder="Select a display name for this codespace"
      />
    </Form>
  );
};

const ChangeCompute = ({ codespace, onRevalidate }: { codespace: Codespace; onRevalidate: () => void }) => {
  const { pop } = useNavigation();
  const { data, isLoading } = useFetch<Endpoints["GET /repos/{owner}/{repo}/codespaces/machines"]["response"]["data"]>(
    `${codespace.repository.url}/codespaces/machines`,
    {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${personalAccessToken}` },
    }
  );
  return (
    <List isLoading={isLoading}>
      <List.Section title="Select compute">
        {data?.machines.map((machine) => (
          <List.Item
            key={machine.name}
            title={`${machine.cpus}-core`}
            subtitle={machine.display_name}
            accessories={
              machine.prebuild_availability && [
                {
                  text: "Prebuild available",
                  icon: {
                    source: Icon.Dot,
                    tintColor: "green",
                  },
                },
              ]
            }
            actions={
              <ActionPanel>
                <Action
                  title="Select"
                  onAction={async () => {
                    const toast = await showToast({
                      title: `Changing compute to ${machine.display_name}...`,
                      style: Toast.Style.Animated,
                    });
                    try {
                      const response = await fetch(`${codespace.url}`, {
                        method: "PATCH",
                        headers: {
                          Accept: "application/vnd.github+json",
                          Authorization: `Bearer ${personalAccessToken}`,
                        },
                        body: JSON.stringify({
                          machine: machine.name,
                        }),
                      });
                      if (response.status !== 200) {
                        const data = (await response.json()) as { message: string; documentation_url: string };
                        toast.style = Toast.Style.Failure;
                        toast.title = data.message;
                        toast.primaryAction = {
                          title: "Copy link to docs",
                          onAction: () => {
                            Clipboard.copy(data.documentation_url);
                          },
                        };
                      } else {
                        await toast.hide();
                        pop();
                        onRevalidate();
                        await showHUD("Request sent. Compute change may take a few minutes.");
                      }
                    } catch (error) {
                      console.log(error);
                      toast.style = Toast.Style.Failure;
                      toast.title = "Failed to change compute";
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
};

const handleDelete = async ({ codespace, onRevalidate }: { codespace: Codespace; onRevalidate: () => void }) => {
  if (
    await confirmAlert({
      title: `Are you sure you want to delete ${codespace.display_name}?`,
      message: codespace.git_status.has_uncommitted_changes
        ? codespace.git_status.has_unpushed_changes
          ? `You have ${codespace.git_status.ahead} unpushed commits as well as other uncommitted changes that will be lost forever.`
          : `You have uncommitted changes that will be lost forever.`
        : codespace.git_status.has_unpushed_changes
        ? `You have ${codespace.git_status.ahead} unpushed commits that will be lost forever.`
        : undefined,
      icon: Icon.Trash,
      dismissAction: {
        title: "Cancel",
        style: Alert.ActionStyle.Cancel,
      },
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    })
  ) {
    const toast = await showToast({
      title: `Deleting ${codespace.display_name}...`,
      style: Toast.Style.Animated,
    });
    try {
      const response = await fetch(`${codespace.url}`, {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${personalAccessToken}`,
        },
      });
      await response.json();
      await toast.hide();
      onRevalidate();
      await showHUD("Successfully deleted");
    } catch (error) {
      console.log(error);
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to delete codespace";
    }
  }
};

function Actions({ codespace, onRevalidate }: { codespace: Codespace; onRevalidate: () => void }) {
  const PreferredAction = preferredEditor
    ? preferredEditor === "vscode"
      ? OpenVSCodeAction
      : OpenWebEditorAction
    : OpenVSCodeAction;
  const SecondaryAction = preferredEditor
    ? preferredEditor === "vscode"
      ? OpenWebEditorAction
      : OpenVSCodeAction
    : OpenWebEditorAction;
  return (
    <ActionPanel>
      <ActionPanel.Section title="Open">
        <PreferredAction codespace={codespace} />
        <SecondaryAction codespace={codespace} />
      </ActionPanel.Section>
      {!codespace.pending_operation && (
        <>
          <ActionPanel.Section title="Update">
            <Action.Push
              title="Rename"
              icon={Icon.Pencil}
              target={<Rename codespace={codespace} onRevalidate={onRevalidate} />}
            />
            <Action.Push
              title="Change compute"
              icon={Icon.ComputerChip}
              target={<ChangeCompute codespace={codespace} onRevalidate={onRevalidate} />}
            />
            <Action
              title="Delete"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={() => handleDelete({ codespace, onRevalidate })}
            />
          </ActionPanel.Section>
        </>
      )}
    </ActionPanel>
  );
}
