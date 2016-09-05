/**
 * Created by lucas on 26/08/2016.
 */
import {Feature} from "./Feature";
import {ProcessBlock} from "./PluginServer";

export interface FeatureExtractor {
    process(block: ProcessBlock): Promise<Feature[][]>;
}