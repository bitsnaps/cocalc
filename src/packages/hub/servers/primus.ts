import { join } from "path";
import { Router } from "express";
const Primus = require("primus");
import base_path from "@cocalc/util-node/base-path";
import Logger from "@cocalc/util-node/logger";
import setup_primus_client from "@cocalc/hub/primus-client";
const { Client } = require("@cocalc/hub/client");
import { len } from "@cocalc/util/misc";
import { database } from "./database";

interface Options {
  httpServer;
  router: Router;
  projectControl;
  clients: { [id: string]: any }; // todo: when client is in typescript, use proper type...
  host: string;
  isPersonal: boolean;
}

export default function init({
  httpServer,
  router,
  projectControl,
  clients,
  host,
  isPersonal,
}: Options): void {
  const logger = Logger("primus");

  // It is now safe to change the primusOpts below, and this
  // doesn't require changing anything anywhere else.
  const primusOpts = { pathname: join(base_path, "hub") };
  const primus_server = new Primus(httpServer, primusOpts);
  logger.info(`listening on ${primusOpts.pathname}`);

  // Make it so new websocket connection requests get handled:
  primus_server.on("connection", function (conn) {
    // Now handle the connection
    logger.info(`new connection from ${conn.address.ip} -- ${conn.id}`);
    clients[conn.id] = new Client({
      conn,
      logger,
      database,
      compute_server:projectControl,
      host,
      personal: isPersonal,
    });
    logger.info(`num_clients=${len(clients)}`);
  });

  // Serve the primus.js client code via the express router.
  setup_primus_client(router, primus_server);
}