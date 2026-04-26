import { router } from "@legacy/router.js";
import { useLegacySelector } from "@client/ui/hooks/useLegacySelector.js";

const tabs = [
  { id: router.VIEW_IDS.EDICT, label: "诏书", icon: "📜" },
  { id: router.VIEW_IDS.COURT, label: "朝堂", icon: "🏛" },
  { id: router.VIEW_IDS.NATION, label: "国家", icon: "🗺" },
];

function getMinisterUnreadCount(state) {
  const ministerUnread = state?.ministerUnread || {};
  return Object.keys(ministerUnread).filter((key) => ministerUnread[key]).length;
}

export function BottomNav({ currentView }) {
  const unreadCount = useLegacySelector((state) => getMinisterUnreadCount(state));

  return (
    <nav id="bottombar" data-ui-shell="react">
      {tabs.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`bottom-tab${isActive ? " bottom-tab--active" : ""}`}
            data-tab-id={tab.id}
            onClick={() => router.setView(tab.id)}
          >
            <div className="bottom-tab-label-wrap">
              <div className="bottom-tab-icon">{tab.icon}</div>
              <div>{tab.label}</div>
              {tab.id === router.VIEW_IDS.COURT ? (
                <span
                  className={`bottom-tab__badge${unreadCount > 0 ? " bottom-tab__badge--visible" : ""}`}
                  aria-label="未读消息数"
                >
                  {unreadCount > 99 ? "99+" : unreadCount > 0 ? unreadCount : ""}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
