import { Action, ActionPanel, Clipboard, Icon, List, showHUD, showToast, Toast, useNavigation } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { personalAccessToken } from "../preferences";
import { Codespace } from "../types";
import { Endpoints } from "@octokit/types";
import fetch from "node-fetch";

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

export default ChangeCompute;