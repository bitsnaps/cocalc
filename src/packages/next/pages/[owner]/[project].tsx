// Page for a project that is owned by a named account
// or organization.

import getProjectId from "lib/names/project";
import withCustomize from "lib/with-customize";
import getProjectInfo from "lib/project/info";
import getProject from "lib/share/get-project";
import Project from "components/project/project";

export default Project;

export async function getServerSideProps(context) {
  const { owner, project } = context.params;
  try {
    const project_id = await getProjectId(owner, project);
    const props = {
      project_id,
      ...(await getProjectInfo(project_id)),
      ...(await getProject(project_id)),
    };
    return withCustomize({ context, props });
  } catch (_err) {
    return { notFound: true };
  }
}
