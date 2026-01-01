import { FC, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useSelector } from "react-redux";
import { Role, Screen } from "delib-npm";
import { Statement } from "@freedi/shared-types";

// Constants
import { LANGUAGES } from "@/constants/Languages";

// Hooks
import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import { useTranslation } from "@/controllers/hooks/useTranslation";
import useStatementColor from "@/controllers/hooks/useStatementColor.ts";

// Redux
import { statementSubscriptionSelector } from "@/redux/statements/statementsSlice";
import { selectCurrentUserBalance } from "@/redux/fairEval/fairEvalSlice";

// Controllers
import { subscribeFairEvalWallet } from "@/controllers/db/fairEval/fairEvalController";

// Components
import NavButtons from "./navButtons/NavButtons";
import HeaderMenu from "./headerMenu/HeaderMenu";
import { WalletDisplay } from "@/view/components/atomic/molecules/WalletDisplay";

interface Props {
  statement?: Statement;
  parentStatement?: Statement;
  handleShare: () => void;
  handleFollowMe: () => void;
  handleInvitePanel: () => void;
  handleLogout: () => void;
  setIsHeaderMenuOpen: (value: boolean) => void;
  isHeaderMenuOpen: boolean;
}

const StatementTopNav: FC<Props> = ({
  statement,
  parentStatement,
  setIsHeaderMenuOpen,
  handleLogout,
  handleFollowMe,
  handleInvitePanel,
  isHeaderMenuOpen,
  handleShare,
}) => {
  const { t, dir, currentLanguage } = useTranslation();
  const { user } = useAuthentication();
  const navigate = useNavigate();
  const { screen } = useParams();
  const role = useSelector(
    statementSubscriptionSelector(statement?.statementId)
  )?.role;
  const headerStyle = useStatementColor({ statement });

  // Fair Evaluation: Get wallet balance
  const topParentId = statement?.topParentId || statement?.statementId;
  const walletBalance = useSelector(selectCurrentUserBalance(topParentId || ''));
  const isFairEvalEnabled = statement?.statementSettings?.enableFairEvaluation;

  // Subscribe to wallet when fair eval is enabled
  useEffect(() => {
    if (!isFairEvalEnabled || !topParentId || !user?.uid) return;

    const unsubscribe = subscribeFairEvalWallet(topParentId, user.uid);

    return () => unsubscribe();
  }, [isFairEvalEnabled, topParentId, user?.uid]);

  if (!statement) return null;

  const isAdmin = role === Role.admin || user?.uid === statement?.creatorId;

  const currentLabel = LANGUAGES.find(
    (lang) => lang.code === currentLanguage
  )?.label;

  function handleNavigation(path: string | Screen) {
    if (!statement?.statementId) return;
    if (Object.values(Screen).includes(path as Screen)) {
      setIsHeaderMenuOpen(false);
      navigate(`/statement-screen/${statement.statementId}/${path}`);

      return;
    }

    navigate(`/statement/${statement.statementId}/${path}`);
    setIsHeaderMenuOpen(false);
  }

  function handleNavigateToSettings() {
    handleNavigation("settings");
  }

  return (
    <nav
      className="app-header app-header--sticky"
      dir={dir}
      data-cy="statement-nav"
      style={{ backgroundColor: headerStyle.backgroundColor }}
    >
      <div className="app-header-wrapper">
        {/* Fair Evaluation Wallet Display */}
        {isFairEvalEnabled && walletBalance !== undefined && (
          <WalletDisplay
            balance={walletBalance}
            size="small"
            compact
          />
        )}
        {statement && (
          <HeaderMenu
            statement={statement}
            isMenuOpen={isHeaderMenuOpen}
            setIsMenuOpen={setIsHeaderMenuOpen}
            headerStyle={headerStyle}
            isAdmin={isAdmin}
            currentLabel={currentLabel}
            t={t}
            onShare={handleShare}
            onLogout={handleLogout}
            onFollowMe={handleFollowMe}
            onInvitePanel={handleInvitePanel}
            onNavigateToSettings={handleNavigateToSettings}
          />
        )}
        <NavButtons
          statement={statement}
          parentStatement={parentStatement}
          screen={screen}
          handleNavigation={handleNavigation}
          headerStyle={headerStyle}
          allowNavigation={true}
        />
      </div>
    </nav>
  );
};

export default StatementTopNav;
