import SearchForm from "./components/ui/searchForm";
import Switch2DControl from "./components/ui/switch2DControl";

document.addEventListener("DOMContentLoaded", function () {
  try { SearchForm.render(); } catch (e) { console.error("SearchForm.render failed:", e); }
  try { Switch2DControl.setup(); } catch (e) { console.error("Switch2DControl.setup failed:", e); }

  setTimeout(() => {
    try { SearchForm.buildRoomList(); } catch (e) { console.error("buildRoomList failed:", e); }
  }, 500);
});
