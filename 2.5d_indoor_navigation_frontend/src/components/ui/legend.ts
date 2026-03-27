import { colors } from "../../services/colorService";
import { UserGroupEnum } from "../../models/userGroupEnum";
import UserService from "../../services/userService";

const LEGEND_ITEMS: { color: string; label: string }[] = [
  { color: '#8FB8D0', label: '교실' },
  { color: '#81C784', label: '실습실' },
  { color: '#CE93D8', label: '화장실' },
  { color: '#FFB74D', label: '사무실' },
  { color: '#A1887F', label: '계단' },
  { color: colors.roomColorS, label: '선택됨' },
];

function create(): void {
  const legendList = document.getElementById("legendList");
  legendList.innerHTML = "";

  const label = document.createElement("li");
  label.innerHTML = "범례";
  label.ariaHidden = "true";
  label.className = "label";
  legendList.appendChild(label);
  legendList.ariaLabel = "범례";

  for (const item of LEGEND_ITEMS) {
    addLegendRecord(legendList, item.color, item.label);
  }

  if (UserService.getCurrentProfile() == UserGroupEnum.wheelchairUsers) {
    const li = document.createElement("li");
    li.style.alignItems = "center";

    const square = document.createElement("div");
    square.className = "colorBox";
    square.style.backgroundColor = "initial";
    square.style.backgroundImage = "url(images/pattern_fill/blank.png)";
    square.style.border = "1px solid black";
    li.appendChild(square);

    const span = document.createElement("span");
    span.innerHTML = "접근 가능";
    li.appendChild(span);

    legendList.appendChild(li);
  }
}

function addLegendRecord(ref: HTMLElement, color: string, text: string): void {
  const li = document.createElement("li");

  const square = document.createElement("div");
  square.className = "colorBox";
  square.style.backgroundColor = color;
  li.appendChild(square);

  const span = document.createElement("span");
  span.innerHTML = text;
  li.appendChild(span);

  ref.appendChild(li);
}

export default {
  create,
};
