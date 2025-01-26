export const layout = "layouts/post-list.vto";

export default function* ({ search, paginate }) {
  const musicPages = search.pages("type=agent");

  for (const page of paginate(musicPages)) {
    yield page;
  }
}