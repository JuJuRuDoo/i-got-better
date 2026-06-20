import { Router, type IRouter } from "express";
import healthRouter from "./health";
import serversRouter from "./servers";
import modsRouter from "./mods";
import modDetailRouter from "./modDetail";
import versionsRouter from "./versions";
import slugsRouter from "./slugs";
import pluginsRouter from "./plugins";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/servers", serversRouter);
router.use("/mods", modDetailRouter);
router.use("/mods", modsRouter);
router.use("/plugins", pluginsRouter);
router.use("/versions", versionsRouter);
router.use("/slugs", slugsRouter);

export default router;
