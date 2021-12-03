import { useRouter } from "next/router";
import { Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import Anonymous from "components/auth/try";

export default function OpenAnonymously() {
  const router = useRouter();
  return (
    <div>
      <Divider>
        <Icon name="mask" style={{ marginRight: "10px" }} /> Anonymously
      </Divider>
      <Anonymous
        minimal
        onSuccess={() =>
          router.push({
            pathname: router.asPath.split("?")[0],
            query: { edit: "true" },
          })
        }
      />
    </div>
  );
}