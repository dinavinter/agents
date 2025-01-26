import lume from "lume/mod.ts";
import attributes from "lume/plugins/attributes.ts";
import code_highlight from "lume/plugins/code_highlight.ts";
import feed from "lume/plugins/feed.ts";
import filter_pages from "lume/plugins/filter_pages.ts";
import gzip from "lume/plugins/gzip.ts";
import inline from "lume/plugins/inline.ts";
import json_ld from "lume/plugins/json_ld.ts";
import jsx from "lume/plugins/jsx.ts";
import metas from "lume/plugins/metas.ts";
import nav from "lume/plugins/nav.ts";
import on_demand from "lume/plugins/on_demand.ts";
import pagefind from "lume/plugins/pagefind.ts";
import relations from "lume/plugins/relations.ts";
import remark from "lume/plugins/remark.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";

const site = lume();

site.use(attributes());
site.use(code_highlight());
site.use(feed());
// site.use(filter_pages({
//     extensions: [".html", ".json"],
//     fn: (page) => page.data.ignored !== true, 
// }));
site.use(gzip());
site.use(inline());
site.use(json_ld());
site.use(jsx());
site.use(metas());
site.use(nav());
site.use(on_demand());
site.use(pagefind());
site.use(relations({
   foreignKeys: {
       agent: "agent_id",
       author: "author_id",
       run: "run_id",
       context: "context_id",
   },
}));
site.use(remark());
site.use(tailwindcss({
    extensions: [".html", ".jsx", ".tsx"], 
    options: {
        content: [
            './_includes/*.{html,vto}',
            './pages/**/*.{html,js,vto,md}',
            './components/**/*.{html,js}',
        ], 
        theme: {
            colors: {
                blue: "#1fb6ff",
                purple: "#7e5bef",
                pink: "#ff49db",
            },
            fontFamily: {
                sans: ["Graphik", "sans-serif"],
                serif: ["Merriweather", "serif"],
            },
        }
    }
}));
site.use(postcss());
export default site;
