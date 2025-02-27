import React, {useCallback, useMemo, useState} from 'react';
import {FlatList, ScrollView, View} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import type {ValueOf} from 'type-fest';
import Button from '@components/Button';
import ConfirmModal from '@components/ConfirmModal';
import FeatureList from '@components/FeatureList';
import type {FeatureListItem} from '@components/FeatureList';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import * as Expensicons from '@components/Icon/Expensicons';
import * as Illustrations from '@components/Icon/Illustrations';
import LottieAnimations from '@components/LottieAnimations';
import type {MenuItemProps} from '@components/MenuItem';
import OfflineWithFeedback from '@components/OfflineWithFeedback';
import type {OfflineWithFeedbackProps} from '@components/OfflineWithFeedback';
import type {PopoverMenuItem} from '@components/PopoverMenu';
import {PressableWithoutFeedback} from '@components/Pressable';
import ScreenWrapper from '@components/ScreenWrapper';
import Text from '@components/Text';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import useWindowDimensions from '@hooks/useWindowDimensions';
import localeCompare from '@libs/LocaleCompare';
import Navigation from '@libs/Navigation/Navigation';
import * as PolicyUtils from '@libs/PolicyUtils';
import * as ReportUtils from '@libs/ReportUtils';
import type {AvatarSource} from '@libs/UserUtils';
import * as App from '@userActions/App';
import * as Policy from '@userActions/Policy';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {PolicyMembers, Policy as PolicyType, ReimbursementAccount, Report} from '@src/types/onyx';
import type * as OnyxCommon from '@src/types/onyx/OnyxCommon';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import withPolicyAndFullscreenLoading from './withPolicyAndFullscreenLoading';
import type {WithPolicyAndFullscreenLoadingProps} from './withPolicyAndFullscreenLoading';
import WorkspacesListRow from './WorkspacesListRow';

type WorkspaceItem = Required<Pick<MenuItemProps, 'title' | 'disabled'>> &
    Pick<MenuItemProps, 'brickRoadIndicator' | 'iconFill' | 'fallbackIcon'> &
    Pick<OfflineWithFeedbackProps, 'errors' | 'pendingAction'> &
    Pick<PolicyType, 'role' | 'type' | 'ownerAccountID'> & {
        icon: AvatarSource;
        action: () => void;
        dismissError: () => void;
        iconType?: ValueOf<typeof CONST.ICON_TYPE_AVATAR | typeof CONST.ICON_TYPE_ICON>;
        policyID?: string;
        adminRoom?: string | null;
        announceRoom?: string | null;
    };

// eslint-disable-next-line react/no-unused-prop-types
type GetMenuItem = {item: WorkspaceItem; index: number};

type ChatType = {
    adminRoom?: string | null;
    announceRoom?: string | null;
};

type ChatPolicyType = Record<string, ChatType>;

type WorkspaceListPageOnyxProps = {
    /** The list of this user's policies */
    policies: OnyxCollection<PolicyType>;

    /** Bank account attached to free plan */
    reimbursementAccount: OnyxEntry<ReimbursementAccount>;

    /** A collection of objects for all policies which key policy member objects by accountIDs */
    allPolicyMembers: OnyxCollection<PolicyMembers>;

    /** All reports shared with the user (coming from Onyx) */
    reports: OnyxCollection<Report>;
};

type WorkspaceListPageProps = WithPolicyAndFullscreenLoadingProps & WorkspaceListPageOnyxProps;

const workspaceFeatures: FeatureListItem[] = [
    {
        icon: Illustrations.MoneyReceipts,
        translationKey: 'workspace.emptyWorkspace.features.trackAndCollect',
    },
    {
        icon: Illustrations.CreditCardsNew,
        translationKey: 'workspace.emptyWorkspace.features.companyCards',
    },
    {
        icon: Illustrations.MoneyWings,
        translationKey: 'workspace.emptyWorkspace.features.reimbursements',
    },
];

/**
 * Dismisses the errors on one item
 */
function dismissWorkspaceError(policyID: string, pendingAction: OnyxCommon.PendingAction) {
    if (pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE) {
        Policy.clearDeleteWorkspaceError(policyID);
        return;
    }

    if (pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD) {
        Policy.removeWorkspace(policyID);
        return;
    }
    throw new Error('Not implemented');
}

function WorkspacesListPage({policies, allPolicyMembers, reimbursementAccount, reports}: WorkspaceListPageProps) {
    const theme = useTheme();
    const styles = useThemeStyles();
    const {translate} = useLocalize();
    const {isOffline} = useNetwork();
    const {isSmallScreenWidth} = useWindowDimensions();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [policyIDToDelete, setPolicyIDToDelete] = useState<string>();
    const [policyNameToDelete, setPolicyNameToDelete] = useState<string>();

    const confirmDeleteAndHideModal = () => {
        if (!policyIDToDelete || !policyNameToDelete) {
            return;
        }

        Policy.deleteWorkspace(policyIDToDelete, policyNameToDelete);
        setIsDeleteModalOpen(false);
    };

    /**
     * Gets the menu item for each workspace
     */
    const getMenuItem = useCallback(
        ({item, index}: GetMenuItem) => {
            const isAdmin = item.role === CONST.POLICY.ROLE.ADMIN;
            // Menu options to navigate to the chat report of #admins and #announce room.
            // For navigation, the chat report ids may be unavailable due to the missing chat reports in Onyx.
            // In such cases, let us use the available chat report ids from the policy.
            const threeDotsMenuItems: PopoverMenuItem[] = [];

            if (isAdmin) {
                threeDotsMenuItems.push({
                    icon: Expensicons.Trashcan,
                    text: translate('workspace.common.delete'),
                    onSelected: () => {
                        setPolicyIDToDelete(item.policyID ?? '');
                        setPolicyNameToDelete(item.title);
                        setIsDeleteModalOpen(true);
                    },
                });
            }

            if (isAdmin && item.adminRoom) {
                threeDotsMenuItems.push({
                    icon: Expensicons.Hashtag,
                    text: translate('workspace.common.goToRoom', {roomName: CONST.REPORT.WORKSPACE_CHAT_ROOMS.ADMINS}),
                    onSelected: () => Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(item.adminRoom ?? '')),
                });
            }

            if (item.announceRoom) {
                threeDotsMenuItems.push({
                    icon: Expensicons.Hashtag,
                    text: translate('workspace.common.goToRoom', {roomName: CONST.REPORT.WORKSPACE_CHAT_ROOMS.ANNOUNCE}),
                    onSelected: () => Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(item.announceRoom ?? '')),
                });
            }

            return (
                <PressableWithoutFeedback
                    role={CONST.ROLE.BUTTON}
                    accessibilityLabel="row"
                    style={[styles.mh5, styles.mb3]}
                    disabled={item.disabled}
                    onPress={item.action}
                >
                    {({hovered}) => (
                        <OfflineWithFeedback
                            key={`${item.title}_${index}`}
                            pendingAction={item.pendingAction}
                            errorRowStyles={styles.ph5}
                            onClose={item.dismissError}
                            errors={item.errors}
                        >
                            <WorkspacesListRow
                                title={item.title}
                                menuItems={threeDotsMenuItems}
                                workspaceIcon={item.icon}
                                ownerAccountID={item.ownerAccountID}
                                workspaceType={item.type}
                                rowStyles={hovered && styles.hoveredComponentBG}
                                layoutWidth={isSmallScreenWidth ? CONST.LAYOUT_WIDTH.NARROW : CONST.LAYOUT_WIDTH.WIDE}
                                brickRoadIndicator={item.brickRoadIndicator}
                                shouldDisableThreeDotsMenu={item.disabled}
                            />
                        </OfflineWithFeedback>
                    )}
                </PressableWithoutFeedback>
            );
        },
        [isSmallScreenWidth, styles.mb3, styles.mh5, styles.ph5, styles.hoveredComponentBG, translate],
    );

    const listHeaderComponent = useCallback(() => {
        if (isSmallScreenWidth) {
            return <View style={styles.mt5} />;
        }

        return (
            <View style={[styles.flexRow, styles.gap5, styles.p5, styles.pl10, styles.appBG]}>
                <View style={[styles.flexRow, styles.flex1]}>
                    <Text
                        numberOfLines={1}
                        style={[styles.flexGrow1, styles.textLabelSupporting]}
                    >
                        {translate('workspace.common.workspaceName')}
                    </Text>
                </View>
                <View style={[styles.flexRow, styles.flex1, styles.workspaceOwnerSectionTitle]}>
                    <Text
                        numberOfLines={1}
                        style={[styles.flexGrow1, styles.textLabelSupporting]}
                    >
                        {translate('workspace.common.workspaceOwner')}
                    </Text>
                </View>
                <View style={[styles.flexRow, styles.flex1, styles.workspaceTypeSectionTitle]}>
                    <Text
                        numberOfLines={1}
                        style={[styles.flexGrow1, styles.textLabelSupporting]}
                    >
                        {translate('workspace.common.workspaceType')}
                    </Text>
                </View>
                <View style={[styles.ml10, styles.mr2]} />
            </View>
        );
    }, [isSmallScreenWidth, styles, translate]);

    const policyRooms = useMemo(() => {
        if (!reports || isEmptyObject(reports)) {
            return;
        }

        return Object.values(reports).reduce<ChatPolicyType>((result, report) => {
            if (!report?.reportID || !report.policyID) {
                return result;
            }

            if (!result[report.policyID]) {
                // eslint-disable-next-line no-param-reassign
                result[report.policyID] = {};
            }

            switch (report.chatType) {
                case CONST.REPORT.CHAT_TYPE.POLICY_ADMINS:
                    // eslint-disable-next-line no-param-reassign
                    result[report.policyID].adminRoom = report.reportID;
                    break;
                case CONST.REPORT.CHAT_TYPE.POLICY_ANNOUNCE:
                    // eslint-disable-next-line no-param-reassign
                    result[report.policyID].announceRoom = report.reportID;
                    break;
                default:
                    break;
            }

            return result;
        }, {});
    }, [reports]);

    /**
     * Add free policies (workspaces) to the list of menu items and returns the list of menu items
     */
    const workspaces = useMemo(() => {
        const reimbursementAccountBrickRoadIndicator = reimbursementAccount?.errors ? CONST.BRICK_ROAD_INDICATOR_STATUS.ERROR : undefined;
        if (isEmptyObject(policies)) {
            return [];
        }

        return Object.values(policies)
            .filter((policy): policy is PolicyType => PolicyUtils.shouldShowPolicy(policy, !!isOffline))
            .map(
                (policy): WorkspaceItem => ({
                    title: policy.name,
                    icon: policy.avatar ? policy.avatar : ReportUtils.getDefaultWorkspaceAvatar(policy.name),
                    action: () => Navigation.navigate(ROUTES.WORKSPACE_INITIAL.getRoute(policy.id)),
                    brickRoadIndicator: reimbursementAccountBrickRoadIndicator ?? PolicyUtils.getPolicyBrickRoadIndicatorStatus(policy, allPolicyMembers),
                    pendingAction: policy.pendingAction,
                    errors: policy.errors,
                    dismissError: () => {
                        if (!policy.pendingAction) {
                            return;
                        }
                        dismissWorkspaceError(policy.id, policy.pendingAction);
                    },
                    disabled: policy.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
                    iconType: policy.avatar ? CONST.ICON_TYPE_AVATAR : CONST.ICON_TYPE_ICON,
                    iconFill: theme.textLight,
                    fallbackIcon: Expensicons.FallbackWorkspaceAvatar,
                    policyID: policy.id,
                    adminRoom: policyRooms?.[policy.id]?.adminRoom ?? policy.chatReportIDAdmins?.toString(),
                    announceRoom: policyRooms?.[policy.id]?.announceRoom ?? policy.chatReportIDAnnounce?.toString(),
                    ownerAccountID: policy.ownerAccountID,
                    role: policy.role,
                    type: policy.type,
                }),
            )
            .sort((a, b) => localeCompare(a.title, b.title));
    }, [reimbursementAccount?.errors, policies, isOffline, theme.textLight, allPolicyMembers, policyRooms]);

    if (isEmptyObject(workspaces)) {
        return (
            <ScreenWrapper
                includeSafeAreaPaddingBottom={false}
                shouldEnablePickerAvoiding={false}
                shouldEnableMaxHeight
                testID={WorkspacesListPage.displayName}
                shouldShowOfflineIndicatorInWideScreen
            >
                <HeaderWithBackButton
                    title={translate('common.workspaces')}
                    shouldShowBackButton={isSmallScreenWidth}
                    onBackButtonPress={() => Navigation.goBack()}
                >
                    <Button
                        accessibilityLabel={translate('workspace.new.newWorkspace')}
                        success
                        medium
                        text={translate('workspace.new.newWorkspace')}
                        onPress={() => App.createWorkspaceWithPolicyDraftAndNavigateToIt()}
                    />
                </HeaderWithBackButton>
                <ScrollView contentContainerStyle={styles.pt3}>
                    <View style={[styles.flex1, isSmallScreenWidth ? styles.workspaceSectionMobile : styles.workspaceSection]}>
                        <FeatureList
                            menuItems={workspaceFeatures}
                            title={translate('workspace.emptyWorkspace.title')}
                            subtitle={translate('workspace.emptyWorkspace.subtitle')}
                            ctaText={translate('workspace.new.newWorkspace')}
                            ctaAccessibilityLabel={translate('workspace.new.newWorkspace')}
                            onCtaPress={() => App.createWorkspaceWithPolicyDraftAndNavigateToIt()}
                            illustration={LottieAnimations.WorkspacePlanet}
                            // We use this style to vertically center the illustration, as the original illustration is not centered
                            illustrationStyle={styles.emptyWorkspaceIllustrationStyle}
                        />
                    </View>
                </ScrollView>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper
            shouldEnablePickerAvoiding={false}
            shouldShowOfflineIndicatorInWideScreen
            testID={WorkspacesListPage.displayName}
        >
            <View style={styles.flex1}>
                <HeaderWithBackButton
                    title={translate('common.workspaces')}
                    shouldShowBackButton={isSmallScreenWidth}
                    onBackButtonPress={() => Navigation.goBack()}
                >
                    <Button
                        accessibilityLabel={translate('workspace.new.newWorkspace')}
                        success
                        medium
                        text={translate('workspace.new.newWorkspace')}
                        onPress={() => App.createWorkspaceWithPolicyDraftAndNavigateToIt()}
                    />
                </HeaderWithBackButton>
                <FlatList
                    data={workspaces}
                    renderItem={getMenuItem}
                    ListHeaderComponent={listHeaderComponent}
                    stickyHeaderIndices={[0]}
                />
            </View>
            <ConfirmModal
                title={translate('workspace.common.delete')}
                isVisible={isDeleteModalOpen}
                onConfirm={confirmDeleteAndHideModal}
                onCancel={() => setIsDeleteModalOpen(false)}
                prompt={translate('workspace.common.deleteConfirmation')}
                confirmText={translate('common.delete')}
                cancelText={translate('common.cancel')}
                danger
            />
        </ScreenWrapper>
    );
}

WorkspacesListPage.displayName = 'WorkspacesListPage';

export default withPolicyAndFullscreenLoading(
    withOnyx<WorkspaceListPageProps, WorkspaceListPageOnyxProps>({
        policies: {
            key: ONYXKEYS.COLLECTION.POLICY,
        },
        allPolicyMembers: {
            key: ONYXKEYS.COLLECTION.POLICY_MEMBERS,
        },
        // @ts-expect-error: ONYXKEYS.REIMBURSEMENT_ACCOUNT is conflicting with ONYXKEYS.FORMS.REIMBURSEMENT_ACCOUNT_FORM
        reimbursementAccount: {
            key: ONYXKEYS.REIMBURSEMENT_ACCOUNT,
        },
        reports: {
            key: ONYXKEYS.COLLECTION.REPORT,
        },
    })(WorkspacesListPage),
);
