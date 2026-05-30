"use client";

import NiceModal from "@ebay/nice-modal-react";
import type {
	ColumnDef,
	ColumnFiltersState,
	SortingState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontalIcon } from "lucide-react";
import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsJson,
	parseAsString,
	useQueryState,
} from "nuqs";
import * as React from "react";
import { toast } from "sonner";
import { AdjustCreditsModal } from "@/components/admin/organizations/adjust-credits-modal";
import { OrganizationBulkActions } from "@/components/admin/organizations/organization-bulk-actions";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { OrganizationLogo } from "@/components/organization/organization-logo";
import { Button } from "@/components/ui/button";
import {
	createSelectionColumn,
	DataTable,
	type FilterConfig,
	SortableColumnHeader,
} from "@/components/ui/custom/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appConfig } from "@/config/app.config";
import { OrganizationSortField } from "@/schemas/admin-organization-schemas";
import { trpc } from "@/trpc/client";

const DEFAULT_SORTING: SortingState = [{ id: "name", desc: false }];

type Organization = {
	id: string;
	name: string;
	logo: string | null;
	createdAt: Date;
	metadata: string | null;
	membersCount: number;
	pendingInvites: number;
	subscriptionStatus: string | null;
	subscriptionPlan: string | null;
	subscriptionId: string | null;
	cancelAtPeriodEnd: boolean | null;
	trialEnd: Date | null;
	credits: number | null;
};

export function OrganizationsTable(): React.JSX.Element {
	const [rowSelection, setRowSelection] = React.useState({});

	const [searchQuery, setSearchQuery] = useQueryState(
		"query",
		parseAsString.withDefault("").withOptions({
			shallow: true,
		}),
	);

	const [pageIndex, setPageIndex] = useQueryState(
		"pageIndex",
		parseAsInteger.withDefault(0).withOptions({
			shallow: true,
		}),
	);

	const [pageSize, setPageSize] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(appConfig.pagination.defaultLimit).withOptions({
			shallow: true,
		}),
	);

	const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useQueryState(
		"subscriptionStatus",
		parseAsArrayOf(parseAsString).withDefault([]).withOptions({
			shallow: true,
		}),
	);

	const [balanceRangeFilter, setBalanceRangeFilter] = useQueryState(
		"balanceRange",
		parseAsArrayOf(parseAsString).withDefault([]).withOptions({
			shallow: true,
		}),
	);

	const [membersCountFilter, setMembersCountFilter] = useQueryState(
		"membersCount",
		parseAsArrayOf(parseAsString).withDefault([]).withOptions({
			shallow: true,
		}),
	);

	const [createdAtFilter, setCreatedAtFilter] = useQueryState(
		"createdAt",
		parseAsArrayOf(parseAsString).withDefault([]).withOptions({
			shallow: true,
		}),
	);

	const [sorting, setSorting] = useQueryState<SortingState>(
		"sort",
		parseAsJson<SortingState>((value) => {
			if (!Array.isArray(value)) return DEFAULT_SORTING;
			return value.filter(
				(item) =>
					item &&
					typeof item === "object" &&
					"id" in item &&
					typeof item.desc === "boolean",
			) as SortingState;
		})
			.withDefault(DEFAULT_SORTING)
			.withOptions({ shallow: true }),
	);

	const utils = trpc.useUtils();

	const deleteOrganizationMutation =
		trpc.admin.organization.delete.useMutation();

	const cancelSubscriptionMutation =
		trpc.admin.organization.cancelSubscription.useMutation();

	const syncFromStripeMutation =
		trpc.admin.organization.syncFromStripe.useMutation();

	// Build columnFilters from URL state
	const columnFilters: ColumnFiltersState = React.useMemo(() => {
		const filters: ColumnFiltersState = [];
		if (membersCountFilter && membersCountFilter.length > 0) {
			filters.push({ id: "membersCount", value: membersCountFilter });
		}
		if (createdAtFilter && createdAtFilter.length > 0) {
			filters.push({ id: "createdAt", value: createdAtFilter });
		}
		if (subscriptionStatusFilter && subscriptionStatusFilter.length > 0) {
			filters.push({
				id: "subscriptionStatus",
				value: subscriptionStatusFilter,
			});
		}
		if (balanceRangeFilter && balanceRangeFilter.length > 0) {
			filters.push({ id: "credits", value: balanceRangeFilter });
		}
		return filters;
	}, [
		membersCountFilter,
		createdAtFilter,
		subscriptionStatusFilter,
		balanceRangeFilter,
	]);

	const handleFiltersChange = (filters: ColumnFiltersState): void => {
		const getFilterValue = (id: string): string[] => {
			const filter = filters.find((f) => f.id === id);
			return Array.isArray(filter?.value) ? (filter.value as string[]) : [];
		};

		setMembersCountFilter(getFilterValue("membersCount"));
		setCreatedAtFilter(getFilterValue("createdAt"));
		setSubscriptionStatusFilter(getFilterValue("subscriptionStatus"));
		setBalanceRangeFilter(getFilterValue("credits"));

		if (pageIndex !== 0) {
			setPageIndex(0);
		}
	};

	const handleSortingChange = (newSorting: SortingState): void => {
		setSorting(newSorting.length > 0 ? newSorting : DEFAULT_SORTING);
		if (pageIndex !== 0) {
			setPageIndex(0);
		}
	};

	// Build sort params from sorting state
	const sortParams = React.useMemo(() => {
		const fallbackSort = { id: "name", desc: false } as const;
		const currentSort = sorting?.[0] ?? DEFAULT_SORTING[0] ?? fallbackSort;
		const sortBy = OrganizationSortField.options.includes(
			currentSort.id as OrganizationSortField,
		)
			? (currentSort.id as OrganizationSortField)
			: "name";
		const sortOrder = currentSort.desc ? ("desc" as const) : ("asc" as const);
		return { sortBy, sortOrder };
	}, [sorting]);

	const { data, isPending } = trpc.admin.organization.list.useQuery(
		{
			limit: pageSize || appConfig.pagination.defaultLimit,
			offset:
				(pageIndex || 0) * (pageSize || appConfig.pagination.defaultLimit),
			query: searchQuery || "",
			sortBy: sortParams.sortBy,
			sortOrder: sortParams.sortOrder,
			filters: {
				membersCount: (membersCountFilter || []) as (
					| "0"
					| "1-5"
					| "6-10"
					| "11+"
				)[],
				createdAt: (createdAtFilter || []) as (
					| "today"
					| "this-week"
					| "this-month"
					| "older"
				)[],
				subscriptionStatus: (subscriptionStatusFilter || []) as (
					| "active"
					| "trialing"
					| "canceled"
					| "past_due"
					| "incomplete"
					| "incomplete_expired"
					| "unpaid"
					| "paused"
				)[],
				balanceRange: (balanceRangeFilter || []) as (
					| "zero"
					| "low"
					| "medium"
					| "high"
				)[],
			},
		},
		{
			placeholderData: (prev) => prev,
		},
	);

	const handleSearchQueryChange = (value: string): void => {
		if (value !== searchQuery) {
			setSearchQuery(value);
			if (pageIndex !== 0) {
				setPageIndex(0);
			}
		}
	};

	const columns: ColumnDef<Organization>[] = [
		createSelectionColumn<Organization>(),
		{
			accessorKey: "name",
			header: ({ column }) => (
				<SortableColumnHeader column={column} title="Organization" />
			),
			cell: ({
				row: {
					original: { name, logo },
				},
			}) => (
				<div className="flex items-center gap-2 py-2">
					<OrganizationLogo className="size-6" name={name} src={logo} />
					<div className="font-medium text-foreground">{name}</div>
				</div>
			),
		},
		{
			accessorKey: "membersCount",
			header: ({ column }) => (
				<SortableColumnHeader column={column} title="Members" />
			),
			cell: ({
				row: {
					original: { membersCount },
				},
			}) => (
				<div className="text-foreground/80">
					{membersCount} {membersCount === 1 ? "member" : "members"}
				</div>
			),
			filterFn: (row, id, value) => {
				const count = row.getValue(id) as number;
				return value.some((range: string) => {
					switch (range) {
						case "0":
							return count === 0;
						case "1-5":
							return count >= 1 && count <= 5;
						case "6-10":
							return count >= 6 && count <= 10;
						case "11+":
							return count > 10;
						default:
							return false;
					}
				});
			},
		},
		{
			accessorKey: "subscriptionStatus",
			header: ({ column }) => (
				<SortableColumnHeader column={column} title="Subscription" />
			),
			cell: ({ row }) => {
				const status = row.original.subscriptionStatus;
				if (!status) return <span className="text-muted-foreground">—</span>;

				const planLabel = row.original.subscriptionPlan
					? row.original.subscriptionPlan.split("_")[0]
					: "Unknown";

				// Capitalize status for display
				const statusLabel =
					status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");

				return (
					<span className="text-foreground/80 text-xs text-nowrap">
						{planLabel} • {statusLabel}
					</span>
				);
			},
		},
		{
			accessorKey: "credits",
			header: ({ column }) => (
				<SortableColumnHeader column={column} title="Credits" />
			),
			cell: ({ row }) => {
				const credits = row.original.credits ?? 0;

				return (
					<div className="text-foreground/80 text-xs font-medium">
						{credits.toLocaleString()}
					</div>
				);
			},
		},
		{
			accessorKey: "pendingInvites",
			enableSorting: false,
			header: () => (
				<div className="font-medium text-foreground text-xs text-nowrap">
					Pending Invites
				</div>
			),
			cell: ({ row }) => {
				const pendingInvites = row.original.pendingInvites;
				return (
					<div className="text-foreground/80 text-xs">{pendingInvites}</div>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: ({ column }) => (
				<SortableColumnHeader column={column} title="Created" />
			),
			cell: ({
				row: {
					original: { createdAt },
				},
			}) => (
				<div className="text-foreground/80">
					{format(createdAt, "dd MMM, yyyy")}
				</div>
			),
			filterFn: (row, id, value) => {
				const date = row.getValue(id) as Date;
				const now = new Date();
				return value.some((range: string) => {
					switch (range) {
						case "today": {
							const todayStart = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate(),
							);
							const todayEnd = new Date(
								now.getFullYear(),
								now.getMonth(),
								now.getDate() + 1,
							);
							return date >= todayStart && date < todayEnd;
						}
						case "this-week": {
							// Adjust to the start of the current week (Sunday)
							const weekStart = new Date(now);
							weekStart.setDate(now.getDate() - now.getDay());
							weekStart.setHours(0, 0, 0, 0);
							return date >= weekStart;
						}
						case "this-month": {
							const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
							monthStart.setHours(0, 0, 0, 0);
							return date >= monthStart;
						}
						case "older": {
							// Defined as older than a month
							const monthAgo = new Date(
								now.getFullYear(),
								now.getMonth() - 1,
								now.getDate(),
							);
							monthAgo.setHours(23, 59, 59, 999); // End of the day a month ago
							return date <= monthAgo;
						}
						default:
							return false;
					}
				});
			},
		},
		{
			id: "actions",
			enableSorting: false,
			cell: ({ row }) => {
				const { id, name } = row.original;
				return (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
									size="icon"
									variant="ghost"
								>
									<MoreHorizontalIcon className="shrink-0" />
									<span className="sr-only">Open menu</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() => {
										NiceModal.show(AdjustCreditsModal, {
											organizationId: id,
											organizationName: name,
											currentBalance: row.original.credits ?? 0,
										});
									}}
								>
									Adjust credits
								</DropdownMenuItem>
								{row.original.subscriptionId &&
									row.original.subscriptionStatus === "active" && (
										<DropdownMenuItem
											onClick={() => {
												window.open(
													`https://dashboard.stripe.com/subscriptions/${row.original.subscriptionId}`,
													"_blank",
												);
											}}
										>
											Open in Stripe
										</DropdownMenuItem>
									)}
								{row.original.subscriptionId &&
									row.original.subscriptionStatus === "active" &&
									!row.original.cancelAtPeriodEnd && (
										<DropdownMenuItem
											onClick={() => {
												NiceModal.show(ConfirmationModal, {
													title: "Cancel subscription",
													message:
														"Are you sure you want to cancel this subscription at the end of the current billing period?",
													confirmLabel: "Cancel Subscription",
													destructive: true,
													onConfirm: async () => {
														await cancelSubscriptionMutation.mutateAsync(
															{
																subscriptionId: row.original.subscriptionId!,
																immediate: false,
															},
															{
																onSuccess: () => {
																	toast.success(
																		"Subscription scheduled to cancel at period end",
																	);
																	utils.admin.organization.list.invalidate();
																},
																onError: (error) => {
																	toast.error(
																		`Failed to cancel: ${error.message}`,
																	);
																},
															},
														);
													},
												});
											}}
											className="text-destructive focus:text-destructive"
										>
											Cancel subscription
										</DropdownMenuItem>
									)}
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => {
										NiceModal.show(ConfirmationModal, {
											title: "Sync from Stripe",
											message: `Sync subscriptions for ${name} from Stripe? This will fetch all subscriptions for this organization's customer ID.`,
											confirmLabel: "Sync",
											onConfirm: async () => {
												await syncFromStripeMutation.mutateAsync(
													{ organizationIds: [id] },
													{
														onSuccess: (result) => {
															const subResult = result.subscriptions;
															const orderResult = result.orders;

															if (
																subResult.failed === 0 &&
																subResult.skipped === 0 &&
																orderResult.failed === 0
															) {
																toast.success(
																	"Successfully synced billing and credit data from Stripe.",
																);
															} else {
																toast.warning(
																	"Sync completed with some issues. Check logs for details.",
																);
															}
															utils.admin.organization.list.invalidate();
														},
														onError: (error) => {
															toast.error(`Failed to sync: ${error.message}`);
														},
													},
												);
											},
										});
									}}
								>
									Sync from Stripe
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => {
										NiceModal.show(ConfirmationModal, {
											title: "Delete organization",
											message:
												"Are you sure you want to delete this organization? This action cannot be undone.",
											confirmLabel: "Delete",
											destructive: true,
											onConfirm: async () => {
												await deleteOrganizationMutation.mutateAsync(
													{ id },
													{
														onSuccess: () => {
															toast.success(
																"Organization has been deleted successfully!",
															);
															utils.organization.get.invalidate();
															utils.organization.list.invalidate();
															utils.admin.organization.list.invalidate();
														},
														onError: () => {
															toast.success(
																"Organization could not be deleted. Please try again.",
															);
														},
													},
												);
											},
										});
									}}
									variant="destructive"
								>
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				);
			},
		},
	];

	const organizationFilters: FilterConfig[] = [
		{
			key: "membersCount",
			title: "Members",
			options: [
				{ value: "0", label: "0 members" },
				{ value: "1-5", label: "1-5 members" },
				{ value: "6-10", label: "6-10 members" },
				{ value: "11+", label: "11+ members" },
			],
		},
		{
			key: "createdAt",
			title: "Created",
			options: [
				{ value: "today", label: "Today" },
				{ value: "this-week", label: "This week" },
				{ value: "this-month", label: "This month" },
				{ value: "older", label: "Older" },
			],
		},
		{
			key: "subscriptionStatus",
			title: "Subscription",
			options: [
				{ value: "active", label: "Active" },
				{ value: "trialing", label: "Trialing" },
				{ value: "canceled", label: "Canceled" },
				{ value: "past_due", label: "Past Due" },
			],
		},
		{
			key: "credits",
			title: "Credits",
			options: [
				{ value: "zero", label: "Zero (0)" },
				{ value: "low", label: "Low (1-1,000)" },
				{ value: "medium", label: "Medium (1k-50k)" },
				{ value: "high", label: "High (50k+)" },
			],
		},
	];

	return (
		<DataTable
			columnFilters={columnFilters}
			columns={columns}
			data={data?.organizations || []}
			defaultSorting={DEFAULT_SORTING}
			emptyMessage="No organization found."
			enableFilters
			enablePagination
			enableRowSelection
			enableSearch
			filters={organizationFilters}
			loading={isPending}
			onFiltersChange={handleFiltersChange}
			onPageIndexChange={setPageIndex}
			onPageSizeChange={setPageSize}
			onRowSelectionChange={setRowSelection}
			onSearchQueryChange={handleSearchQueryChange}
			onSortingChange={handleSortingChange}
			pageIndex={pageIndex || 0}
			pageSize={pageSize || appConfig.pagination.defaultLimit}
			renderBulkActions={(table) => <OrganizationBulkActions table={table} />}
			rowSelection={rowSelection}
			searchPlaceholder="Search organizations..."
			searchQuery={searchQuery || ""}
			sorting={sorting}
			totalCount={data?.total ?? 0}
		/>
	);
}
