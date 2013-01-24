name "dev_server"
description "The  role for dev servers"

run_list ["recipe[nginx]","recipe[nginx::koding_local]", "recipe[nodejs]","recipe[golang]", "recipe[supervisord]"]

default_attributes({ "nginx" => {
                                "worker_processes" => "1",
                                "backend_ports" => [3020],
                                "server_name" => "as.koding.com",
                                "maintenance_page" => "maintenance.html",
                                "static_files" => "/opt/koding/current/client"
                     },
                     "kd_deploy" => {
                                "revision_tag" => "HEAD",
                                "release_action" => :deploy,
                                "deploy_dir" => '/opt/koding',
                     },
                     "launch" => {
                                "config" => "autoscale",
                                "programs" => ["buildClient webserver","goBroker","cacheworker","guestCleanup", "guestworker", "socialWorker" ]
                     }
})
