"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface Testimonial {
	name: string;
	role: string;
	company: string;
	quote: string;
	avatar: string;
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
	return (
		<figure className="flex flex-col justify-between gap-8 rounded-2xl border border-marketing-border bg-marketing-card p-6 text-sm transition-colors hover:bg-marketing-card-hover">
			<blockquote className="flex flex-col gap-4">
				<p className="text-base leading-7 text-marketing-fg">
					"{testimonial.quote}"
				</p>
			</blockquote>
			<figcaption className="flex items-center gap-4">
				<div className="flex size-11 overflow-hidden rounded-full outline -outline-offset-1 outline-black/5 dark:outline-white/5">
					<Image
						src={testimonial.avatar}
						alt={testimonial.name}
						width={160}
						height={160}
						className="size-full object-cover bg-white/75 dark:bg-black/75"
					/>
				</div>
				<div>
					<p className="font-semibold text-marketing-fg">{testimonial.name}</p>
					<p className="text-marketing-fg-muted">
						{testimonial.role} · {testimonial.company}
					</p>
				</div>
			</figcaption>
		</figure>
	);
}

export function TestimonialsSection() {
	const testimonials: Testimonial[] = [
		{
			name: "Sarah Chen",
			role: "Pre-med",
			company: "UC Berkeley",
			quote:
				"I uploaded a semester of orgo lectures and Lumen turned them into quizzes that drilled exactly what I kept missing. Went from a C+ to an A-.",
			avatar: "/marketing/avatars/woman-44.jpg",
		},
		{
			name: "Marcus Johnson",
			role: "Self-taught dev",
			company: "career switcher",
			quote:
				"The tutor answers from my own notes, not some random internet thing. It's like having a TA who actually read the syllabus.",
			avatar: "/marketing/avatars/man-32.jpg",
		},
		{
			name: "Emily Rodriguez",
			role: "Nursing student",
			company: "NCLEX prep",
			quote:
				"The study plan kept me honest. It told me what to review each day and reshuffled when I fell behind. I stopped panicking the night before.",
			avatar: "/marketing/avatars/woman-68.jpg",
		},
		{
			name: "David Kim",
			role: "High-school senior",
			company: "AP Calculus",
			quote:
				"Short-answer questions with real feedback are a game changer. It catches when I half-understand something and explains it differently.",
			avatar: "/marketing/avatars/man-75.jpg",
		},
		{
			name: "Priya Sharma",
			role: "Lecturer",
			company: "Dept. of Physics",
			quote:
				"I share a course workspace with my class and can see where the whole cohort is struggling before the exam. It changed how I run review sessions.",
			avatar: "/marketing/avatars/woman-26.jpg",
		},
		{
			name: "Alex Turner",
			role: "Bootcamp grad",
			company: "studying for certs",
			quote:
				"Mastery scores per topic showed me I was wasting hours on stuff I already knew. Now I only study the red bars.",
			avatar: "/marketing/avatars/man-46.jpg",
		},
	];

	return (
		<section id="testimonials" className="py-16">
			<div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 md:max-w-3xl lg:max-w-7xl lg:gap-16 lg:px-10">
				{/* Header */}
				<div className="flex max-w-2xl flex-col gap-6">
					<div className="flex flex-col gap-2">
						<h2
							className={cn(
								"text-pretty font-display text-4xl leading-tight tracking-tight",
								"text-marketing-fg",
								"sm:text-5xl",
							)}
						>
							Learners who stopped cramming.
						</h2>
					</div>
					<div className="text-base leading-7 text-marketing-fg-muted text-pretty">
						<p>
							From pre-med to bootcamp grads to the lecturers teaching them —
							here's what changed once the busywork went away.
						</p>
					</div>
				</div>

				{/* Testimonials Grid */}
				<div>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{testimonials.map((testimonial) => (
							<TestimonialCard
								key={testimonial.name}
								testimonial={testimonial}
							/>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
