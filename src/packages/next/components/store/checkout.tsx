/*
Checkout -- finalize purchase and pay.
*/

import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import { Alert, Button, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { money } from "@cocalc/frontend/site-licenses/purchase/util";
import SiteName from "components/share/site-name";
import A from "components/misc/A";
import useIsMounted from "lib/hooks/mounted";
import PaymentMethods from "components/billing/payment-methods";

export default function Checkout() {
  const isMounted = useIsMounted();
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [subTotal, setSubTotal] = useState<number>(0);
  const cart = useAPI("/shopping/cart/get");
  const items = useMemo(() => {
    if (!cart.result) return undefined;
    const x: any[] = [];
    let subTotal = 0;
    for (const item of cart.result) {
      if (!item.checked) continue;
      item.cost = computeCost(item.description);
      subTotal += item.cost.discounted_cost;
      x.push(item);
    }
    setSubTotal(subTotal);
    return x;
  }, [cart.result]);

  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading center />;
  }

  async function placeOrder() {
    try {
      setPlacingOrder(true);
      await delay(5000);
    } finally {
      if (!isMounted.current) return;
      setPlacingOrder(false);
    }
  }

  const columns = [
    {
      title: "Product",
      align: "center" as "center",
      render: () => (
        <div style={{ color: "darkblue" }}>
          <Icon name="key" style={{ fontSize: "24px" }} />
          <div style={{ fontSize: "10pt" }}>Site License</div>
        </div>
      ),
    },
    {
      width: "60%",
      render: (_, { cost, description }) => {
        const { input } = cost;
        return (
          <>
            <div style={{ fontSize: "12pt" }}>
              {description.title && (
                <div>
                  <b>{description.title}</b>
                </div>
              )}
              {description.description && <div>{description.description}</div>}
              {describe_quota({
                ram: input.custom_ram,
                cpu: input.custom_cpu,
                disk: input.custom_disk,
                always_running: input.custom_always_running,
                member: input.custom_member,
                user: input.user,
              })}
            </div>
            <div>
              <Icon name="users" /> Quantity: {description.runLimit}{" "}
              simultaneous running projects
            </div>
          </>
        );
      },
    },
    {
      title: "Price",
      align: "right" as "right",
      render: (_, { cost }) => (
        <b style={{ fontSize: "13pt" }}>
          <DisplayCost cost={cost} simple />
        </b>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: "900px", margin: "auto" }}>
      {items.length == 0 && (
        <>
          <h3>
            <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />
            {cart.result?.length > 0 && (
              <>
                Nothing in Your <SiteName />{" "}
                <A href="/store/cart">Shopping Cart</A> is Selected
              </>
            )}
            {(cart.result?.length ?? 0) == 0 && (
              <>
                Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is
                Empty
              </>
            )}
          </h3>
          <A href="/store/site-license">Buy a License</A>
        </>
      )}
      {items.length > 0 && (
        <div>
          <div
            style={{
              float: "right",
              margin: "0 0 15px 15px",
              maxWidth: "350px",
              textAlign: "center",
              border: "1px solid #ddd",
              padding: "15px",
              borderRadius: "5px",
            }}
          >
            <span style={{ fontSize: "13pt" }}>
              <TotalCost items={items} />
            </span>
            <Button
              disabled={subTotal == 0 || placingOrder}
              style={{ margin: "15px 0" }}
              size="large"
              type="primary"
              href="/store/checkout"
              onClick={placeOrder}
            >
              Place Your Order
            </Button>
            <Terms />
          </div>
          <div style={{ maxWidth: "900px", margin: "auto" }}>
            <h3 style={{ fontSize: "16pt" }}>
              <Icon name={"list"} style={{ marginRight: "5px" }} />
              Checkout (<A href="/store/cart">{items.length} items</A>)
            </h3>
            <br />
            <br />
            <h4 style={{ fontSize: "13pt" }}>1. Payment Method</h4>
            <p>
              The default payment method shown below will be used for this
              purchase.
            </p>
            <PaymentMethods startMinimized />
            <h4 style={{ fontSize: "13pt", marginTop: "30px" }}>
              2. Review Items ({items.length})
            </h4>
            <Table
              columns={columns}
              dataSource={items}
              rowKey={"id"}
              pagination={{ hideOnSinglePage: true }}
            />
            <h4 style={{ fontSize: "13pt", marginTop: "30px" }}>
              3. Place Your Order
            </h4>
            <div
              style={{ fontSize: "12pt", margin: "15px 0", display: "flex" }}
            >
              <Button
                disabled={subTotal == 0 || placingOrder}
                style={{ marginLeft: "15px", marginTop: "7px" }}
                size="large"
                type="primary"
                href="/store/checkout"
                onClick={placeOrder}
              >
                Place Your Order
              </Button>

              <div style={{ fontSize: "15pt", marginLeft: "30px" }}>
                <TotalCost items={cart.result} />
                <br />
                <Terms />
              </div>
              <br />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TotalCost({ items }) {
  let discounted_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      discounted_cost += cost.discounted_cost;
    }
  }
  return (
    <>
      Order total: <b style={{ color: "darkred" }}>{money(discounted_cost)}</b>
    </>
  );
}

function Terms() {
  return (
    <div style={{ color: "#666", fontSize: "10pt" }}>
      By placing your order, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service
      </A>{" "}
      regarding refunds and subscriptions.
    </div>
  );
}